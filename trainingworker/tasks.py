"""
Celery tasks: run_experiment, run_evaluation
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import requests as _requests
from celery import Task
from celery.exceptions import SoftTimeLimitExceeded

from celery_app import celery_app
from context import DataContext, CheckpointContext, ProgressReporter
from storage.minio_io import MinioIO
from registry import get_trainer_class

logger = logging.getLogger(__name__)

try:
    import mlflow
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False


@celery_app.task(
    bind=True,
    name="tasks.run_experiment",
    max_retries=0,
    acks_late=True,
)
def run_experiment(self: Task, payload: dict) -> dict:
    """
    payload shape (built by API service):
    {
        "experiment_id":        int,
        "ml_model_id":          int,
        "trainer_key":          str,   # "yolo" | "resnet" | …
        "minio":                { endpoint, bucket, ckpt_bucket, access_key, secret_key, secure },
        "datasets":             { "TRAIN": [...], "VALIDATION": [...], "TEST": [...] },
        "sampling_strategy":    str,
        "pretrained_checkpoint": str | None,
        "classes":              list[str],
        "train_params":         dict,
        "api_callback_url":     str,
    }
    """
    exp_id     = payload["experiment_id"]
    project_id = payload.get("project_id", 0)
    exp_dir    = Path(os.getenv("EXPERIMENT_WORKDIR", "/tmp")) / f"exp_{exp_id}"
    exp_dir.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(level=logging.INFO)
    logger.info("=== Starting experiment %d (trainer=%s) ===", exp_id, payload["trainer_key"])

    minio    = MinioIO(**payload["minio"])
    data_ctx = DataContext(payload, exp_dir, minio)
    ckpt_ctx = CheckpointContext(payload, exp_dir, minio)

    reporter = ProgressReporter(
        experiment_id=exp_id,
        api_base_url=payload["api_callback_url"],
        minio=minio,
        project_id=project_id,
    )

    # ── MLflow setup ──────────────────────────────────────────────────────────
    mlflow_active = False
    if MLFLOW_AVAILABLE:
        try:
            mlflow.set_tracking_uri(os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000"))
            mlflow.set_experiment(f"project_{project_id}")
            mlflow.start_run(run_name=f"exp_{exp_id} — {payload.get('experiment_name', '')}")
            mlflow.log_params({k: str(v)[:250] for k, v in payload["train_params"].items()})
            mlflow.set_tags({
                "trainer_key":   payload["trainer_key"],
                "experiment_id": str(exp_id),
                "project_id":    str(project_id),
            })
            mlflow_active = True
            run_id = mlflow.active_run().info.run_id
            logger.info("MLflow run started: run_id=%s for experiment %d", run_id, exp_id)
            # Persist run_id so UI can deep-link to this run
            reporter._update_status("PENDING", mlflow_run_id=run_id)
        except Exception as e:
            logger.warning("MLflow setup failed: %s", e)

    try:
        # ── DOWNLOADING ───────────────────────────────────────────────────────
        reporter._update_status("DOWNLOADING")
        data_ctx.download_all()

        # ── Resolve trainer + build params ────────────────────────────────────
        TrainerCls = get_trainer_class(payload["trainer_key"])
        ParamsCls  = TrainerCls.TRAIN_PARAMS_CLASS
        params = ParamsCls(
            classes=payload["classes"],
            **payload["train_params"],
            output_dir=str(exp_dir),
            experiment_name="train",
        )
        params.run_dir.mkdir(parents=True, exist_ok=True)

        # ── RUNNING ───────────────────────────────────────────────────────────
        reporter._update_status("RUNNING")
        trainer = TrainerCls(params, data_ctx, ckpt_ctx, reporter)
        history = trainer.fit()

        if MLFLOW_AVAILABLE and mlflow_active:
            try:
                final = history["val_metrics"][-1] if history["val_metrics"] else {}
                mlflow.log_metrics(final)
                mlflow.set_tag("status", "COMPLETED")
            except Exception as e:
                logger.warning("MLflow final logging failed: %s", e)

        logger.info("Experiment %d completed. History keys: %s", exp_id, list(history.keys()))
        return {"experiment_id": exp_id, "status": "COMPLETED"}

    except SoftTimeLimitExceeded:
        msg = f"Experiment {exp_id} hit the soft time limit and was cancelled."
        logger.warning(msg)
        if MLFLOW_AVAILABLE and mlflow_active:
            try: mlflow.set_tag("status", "CANCELLED")
            except Exception: pass
        reporter.fail(msg)
        raise

    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Experiment %d failed: %s", exp_id, msg)
        if MLFLOW_AVAILABLE and mlflow_active:
            try: mlflow.set_tag("status", "FAILED")
            except Exception: pass
        reporter.fail(msg)
        raise

    finally:
        if MLFLOW_AVAILABLE and mlflow_active:
            try: mlflow.end_run()
            except Exception: pass


# ── Visualization task ────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="tasks.run_visualization",
    max_retries=0,
    acks_late=True,
)
def run_visualization(self: Task, payload: dict) -> dict:
    """
    payload shape:
    {
        "visualization_id": int,
        "project_id":       int,
        "trainer_key":      str,
        "minio":            { endpoint, bucket, ckpt_bucket, access_key, secret_key, secure },
        "viz_bucket":       str,
        "checkpoint_key":   str,
        "input_image_keys": list[str],
        "classes":          list[str],
        "confidence":       float,
        "api_callback_url": str,
    }
    """
    viz_id     = payload["visualization_id"]
    project_id = payload["project_id"]
    api_base   = payload["api_callback_url"].rstrip("/")
    viz_dir    = Path(os.getenv("EXPERIMENT_WORKDIR", "/tmp")) / f"viz_{viz_id}"
    viz_dir.mkdir(parents=True, exist_ok=True)
    viz_bucket = payload.get("viz_bucket", "visualizations")

    logging.basicConfig(level=logging.INFO)
    logger.info("=== Starting visualization %d (trainer=%s) ===", viz_id, payload["trainer_key"])

    minio = MinioIO(**payload["minio"])

    def _patch(endpoint: str, data: dict) -> None:
        url = f"{api_base}/visualizations/{viz_id}/{endpoint}"
        try:
            _requests.patch(url, json=data, timeout=15).raise_for_status()
        except Exception as exc:
            logger.warning("Visualization callback %s failed: %s", endpoint, exc)

    try:
        _patch("progress", {"status": "RUNNING"})

        # Download checkpoint
        ckpt_local = viz_dir / "checkpoint.pt"
        minio.download_file(payload["checkpoint_key"], ckpt_local, bucket=payload["minio"]["ckpt_bucket"])
        logger.info("Checkpoint downloaded: %s", ckpt_local)

        # Download input images
        img_dir = viz_dir / "inputs"
        img_dir.mkdir(exist_ok=True)
        for key in payload["input_image_keys"]:
            fname = Path(key).name
            minio.download_file(key, img_dir / fname, bucket=viz_bucket)
        logger.info("Downloaded %d input images", len(payload["input_image_keys"]))

        # Build minimal trainer instance
        TrainerCls = get_trainer_class(payload["trainer_key"])
        ParamsCls  = TrainerCls.TRAIN_PARAMS_CLASS
        classes    = payload.get("classes", [])

        params = ParamsCls(
            classes=classes,
            epochs=1,
            output_dir=str(viz_dir),
            experiment_name="viz",
        )
        params.run_dir.mkdir(parents=True, exist_ok=True)

        class _NoCkpt:
            def has_pretrained(self): return False
            def get_pretrained_path(self): return None

        class _NoReporter:
            def update(self, *a, **kw): pass
            def complete(self, *a, **kw): pass
            def fail(self, msg): pass

        trainer = TrainerCls(params, None, _NoCkpt(), _NoReporter())
        trainer.load_checkpoint(str(ckpt_local))
        logger.info("Model loaded from checkpoint")

        # Collect image paths
        _IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
        image_paths = sorted(
            p for p in img_dir.iterdir()
            if p.suffix.lower() in _IMG_EXTS
        )

        # Run visualization
        output_dir = viz_dir / "outputs"
        per_image = trainer.visualize(image_paths, output_dir, confidence=payload.get("confidence", 0.5))

        # Upload annotated images to MinIO
        out_prefix = f"project_{project_id}/viz_{viz_id}/outputs/"
        for item in per_image:
            out_path = output_dir / item["output_filename"]
            if out_path.exists():
                ext = out_path.suffix.lower()
                ct  = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
                key = out_prefix + item["output_filename"]
                minio.upload_file(out_path, key, bucket=viz_bucket, content_type=ct)
                item["output_key"] = key
            else:
                item["output_key"] = None

        _patch("complete", {"results": per_image})
        logger.info("=== Visualization %d completed ===", viz_id)
        return {"visualization_id": viz_id, "status": "COMPLETED"}

    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Visualization %d failed: %s", viz_id, msg)
        _patch("fail", {"error_message": msg})
        raise


# ── Evaluation task ───────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="tasks.run_evaluation",
    max_retries=0,
    acks_late=True,
)
def run_evaluation(self: Task, payload: dict) -> dict:
    """
    payload shape (built by API service):
    {
        "evaluation_id":   int,
        "project_id":      int,
        "trainer_key":     str,
        "minio":           { endpoint, bucket, ckpt_bucket, access_key, secret_key, secure },
        "checkpoint_key":  str,   # MinIO key inside ckpt_bucket
        "datasets": [
            { dataset_version_id, name, images_prefix, annotations_key, has_annotations }
        ],
        "classes":         list[str],
        "api_callback_url": str,
    }
    """
    eval_id  = payload["evaluation_id"]
    api_base = payload["api_callback_url"].rstrip("/")
    eval_dir = Path(os.getenv("EXPERIMENT_WORKDIR", "/tmp")) / f"eval_{eval_id}"
    eval_dir.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(level=logging.INFO)
    logger.info("=== Starting evaluation %d (trainer=%s) ===", eval_id, payload["trainer_key"])

    minio = MinioIO(**payload["minio"])

    def _patch(endpoint: str, data: dict) -> None:
        url = f"{api_base}/evaluations/{eval_id}/{endpoint}"
        try:
            _requests.patch(url, json=data, timeout=15).raise_for_status()
        except Exception as exc:
            logger.warning("Evaluation callback %s failed: %s", endpoint, exc)

    try:
        _patch("progress", {"status": "RUNNING"})

        # Download checkpoint from MinIO
        ckpt_key   = payload["checkpoint_key"]
        ckpt_local = eval_dir / "checkpoint.pt"
        minio.download_file(ckpt_key, ckpt_local, bucket=payload["minio"]["ckpt_bucket"])
        logger.info("Checkpoint downloaded: %s", ckpt_local)

        # Build a minimal trainer instance (no DataContext / reporter needed for eval)
        TrainerCls = get_trainer_class(payload["trainer_key"])
        ParamsCls  = TrainerCls.TRAIN_PARAMS_CLASS
        classes    = payload.get("classes", [])

        params = ParamsCls(
            classes=classes,
            epochs=1,
            output_dir=str(eval_dir),
            experiment_name="eval",
        )
        params.run_dir.mkdir(parents=True, exist_ok=True)

        class _NoCkpt:
            def has_pretrained(self): return False
            def get_pretrained_path(self): return None

        class _NoReporter:
            def update(self, *a, **kw): pass
            def complete(self, *a, **kw): pass
            def fail(self, msg): pass

        trainer = TrainerCls(params, None, _NoCkpt(), _NoReporter())
        trainer.model = trainer.load_model().to(trainer.device)
        trainer.load_checkpoint(str(ckpt_local))
        logger.info("Model loaded from checkpoint")

        # Evaluate each dataset version independently
        dataset_results: list[dict] = []
        for ds_info in payload["datasets"]:
            dv_id   = ds_info["dataset_version_id"]
            ds_dir  = eval_dir / f"dv_{dv_id}"
            img_dir = ds_dir / "images"
            ann_path = ds_dir / "annotation.json"

            logger.info("[dv_%d] Downloading %d images ...", dv_id, 0)
            minio.download_prefix(ds_info["images_prefix"], img_dir)

            ann_file: Optional[Path] = None
            if ds_info.get("has_annotations") and ds_info.get("annotations_key"):
                try:
                    minio.download_file(ds_info["annotations_key"], ann_path)
                    ann_file = ann_path
                    logger.info("[dv_%d] Annotation downloaded", dv_id)
                except Exception as exc:
                    logger.warning("[dv_%d] Annotation download failed: %s", dv_id, exc)

            logger.info("[dv_%d] Running evaluate_dataset ...", dv_id)
            metrics = trainer.evaluate_dataset(img_dir, ann_file)
            logger.info("[dv_%d] metrics=%s", dv_id, metrics)

            dataset_results.append({
                "dataset_version_id": dv_id,
                "name":               ds_info.get("name", f"Dataset {dv_id}"),
                "metrics":            metrics,
            })

        # Aggregate overall metrics (mean of numeric values across all datasets)
        overall: dict = {}
        if dataset_results:
            all_keys = set()
            for r in dataset_results:
                all_keys.update(r["metrics"].keys())
            for k in all_keys:
                vals = [
                    r["metrics"][k]
                    for r in dataset_results
                    if isinstance(r["metrics"].get(k), (int, float))
                ]
                if vals:
                    overall[k] = round(sum(vals) / len(vals), 4)

        _patch("complete", {
            "overall_metrics": overall,
            "dataset_results": dataset_results,
        })

        logger.info("=== Evaluation %d completed ===", eval_id)
        return {"evaluation_id": eval_id, "status": "COMPLETED"}

    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Evaluation %d failed: %s", eval_id, msg)
        _patch("fail", {"error_message": msg})
        raise
