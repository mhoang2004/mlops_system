# An MLOps Platform for Distributed Computer Vision Training: Design and Implementation

---

## Abstract

The growing demand for machine learning in computer vision applications has exposed a critical gap between model research and production deployment: researchers lack lightweight, self-hosted infrastructure that unifies dataset management, distributed training orchestration, experiment tracking, and model lifecycle management without dependence on commercial cloud services. This paper presents a full-stack MLOps platform designed to close that gap. The system integrates five core services — a PostgreSQL metadata store, a MinIO object store, a Redis-backed Celery task queue, a FastAPI REST backend, and a React-based web interface — into a single deployable stack. Key contributions include (1) a schema-driven trainer abstraction that auto-generates UI configuration forms directly from Pydantic parameter models, enabling new training frameworks to be registered without frontend changes; (2) a startup-time server self-registration mechanism that assigns each Celery worker a dedicated routing queue, ensuring experiments are dispatched exclusively to the user-selected compute node; (3) a multi-machine training architecture that supports heterogeneous nodes — including GPU servers on remote networks — connected via overlay VPN, with MinIO and API callback endpoints resolved per-worker at job dispatch time rather than hardcoded at deploy time. The platform supports the full experiment lifecycle from dataset upload and annotation import through training, evaluation, and checkpoint promotion. Experiment metrics are tracked per-epoch via MLflow. A working implementation targeting YOLO-style object detection is demonstrated, with the trainer plugin system supporting future extension to arbitrary architectures. Future work includes annotation tooling via CVAT integration and per-epoch metric visualization within the platform UI.

---

## 1. Introduction

### 1.1 Motivation

Machine learning engineering teams routinely spend a disproportionate fraction of their time on infrastructure rather than on models. A practitioner training an object detection model must: upload and version training images, manage annotation files, select a compute node, configure hyperparameters, monitor training progress, retrieve the best checkpoint, and record which configuration produced which result. Without dedicated tooling, these steps are performed manually — with scripts, shared folders, and spreadsheets — making experiments difficult to reproduce and results difficult to compare.

Commercial MLOps platforms (AWS SageMaker, Google Vertex AI, Azure ML) solve this problem but introduce cost, vendor lock-in, and data residency concerns that are prohibitive for many organizations, particularly in academic, healthcare, and defense contexts where data cannot leave on-premises infrastructure.

### 1.2 The Gap

Existing open-source solutions address parts of the problem but not the whole. MLflow excels at metric logging but does not manage datasets or dispatch training jobs. Kubeflow provides full orchestration but requires Kubernetes expertise and significant cluster resources. Label Studio and CVAT handle annotation but have no training pipeline. No lightweight, single-stack solution exists that covers dataset versioning, job dispatch to heterogeneous hardware, experiment tracking, and a usable web interface under a manageable operational footprint.

### 1.3 Contributions

This work makes the following contributions:

- **Schema-driven trainer plugin system**: trainers register Pydantic parameter schemas at startup; the API stores them and the frontend renders configuration forms automatically, requiring zero frontend changes to add a new trainer.
- **Per-worker queue routing**: each Celery worker queries the API on startup to obtain its database ID and subscribes to a dedicated named queue (`server_{id}`), enabling the API to route tasks to exactly the user-selected compute node.
- **Remote worker architecture**: MinIO endpoints and API callback URLs are embedded in the job payload at dispatch time using configurable per-environment variables, decoupling workers from Docker-internal networking.
- **Unified experiment lifecycle**: a six-state FSM (PENDING → DOWNLOADING → RUNNING → COMPLETED | FAILED | CANCELLED) with real-time callback reporting and automatic checkpoint upload on completion.
- **Server occupancy warning**: the UI queries active experiments per server before job submission, surfacing conflicts to the user without blocking submission.

### 1.4 Paper Outline

Section 2 reviews related work. Section 3 describes the system methodology and architecture. Section 4 details the experimental setup and results. Section 5 discusses limitations and future directions. Section 6 concludes.

---

## 2. Related Work

### 2.1 Experiment Tracking

**MLflow** [Zaharia et al., 2018] is the de facto standard for metric and parameter logging. It provides a Python SDK, a tracking server, and a model registry. However, MLflow is not a job scheduler and does not manage datasets or compute. Our platform integrates MLflow as a metric sink (per-epoch logging via `mlflow.log_metrics`) while providing the orchestration layer MLflow lacks.

**Weights & Biases (W&B)** offers richer visualization than MLflow but is cloud-hosted, requiring data to leave the organization. **Neptune.ai** and **Comet ML** share the same limitation. Our platform is fully self-hosted.

### 2.2 Workflow Orchestration

**Kubeflow Pipelines** [Bisong, 2019] orchestrate ML workflows as DAGs on Kubernetes. The operational overhead is substantial: Kubernetes cluster management, Istio, KFServing, and Argo Workflows are all required. For teams without dedicated DevOps capacity, this is infeasible. **Apache Airflow** similarly requires significant infrastructure.

Our approach uses **Celery** with Redis as broker — a far lighter stack that requires no cluster scheduler while still providing reliable distributed task execution, retries, and worker monitoring.

### 2.3 Dataset Management

**DVC (Data Version Control)** [Kuprieiev et al., 2020] provides Git-like versioning for datasets stored in object storage. It is file-system centric and CLI-driven, with no web interface. Our platform stores dataset metadata (name, version, label type, storage path) in PostgreSQL and the files themselves in MinIO, presenting them through a web UI with image browsing and annotation upload.

**Hugging Face Datasets** focuses on NLP datasets and provides no training orchestration.

### 2.4 Annotation Tooling

**CVAT** [Sekachev et al., 2019] and **Label Studio** are the leading open-source annotation platforms. Neither integrates with a training pipeline natively. Our platform currently imports COCO JSON annotation files produced by external tools; CVAT integration (task push/pull) is identified as future work.

### 2.5 Comparison Summary

| Feature | Our Platform | MLflow | Kubeflow | DVC | W&B |
|---|---|---|---|---|---|
| Dataset versioning | ✓ | — | partial | ✓ | — |
| Job dispatch | ✓ | — | ✓ | — | — |
| Experiment tracking | ✓ (via MLflow) | ✓ | ✓ | — | ✓ |
| Checkpoint management | ✓ | partial | — | — | — |
| Web UI | ✓ | ✓ | ✓ | — | ✓ |
| Self-hosted | ✓ | ✓ | ✓ | ✓ | — |
| Multi-node GPU routing | ✓ | — | ✓ | — | — |
| <10 min setup | ✓ | ✓ | — | ✓ | — |

---

## 3. Methodology

### 3.1 System Architecture Overview

The platform is composed of five Docker services orchestrated by Docker Compose:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React 19 + Vite)                                  │
│  React Router 7 · Tailwind CSS 4 · TypeScript              │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP REST (port 8000)
┌────────────────────▼────────────────────────────────────────┐
│  FastAPI (Python 3.11)                                       │
│  8 routers · SQLAlchemy ORM · Pydantic v2                   │
└────┬──────────┬──────────────┬──────────────────────────────┘
     │          │              │
┌────▼───┐ ┌───▼────┐  ┌──────▼──────────────────────────────┐
│Postgres│ │ MinIO  │  │  Redis (broker + result backend)     │
│  15    │ │ S3-API │  └──────┬──────────────────────────────┘
└────────┘ └────────┘         │ Celery task queue
                    ┌─────────▼────────────────────────────────┐
                    │  Training Worker (Celery, PyTorch)        │
                    │  Machine 1 (CPU) · Machine 2 (GPU)        │
                    │  Queue: celery + server_{id}              │
                    └──────────────────────────────────────────┘
                              │
                    ┌─────────▼────────────────────────────────┐
                    │  MLflow Tracking Server                   │
                    │  SQLite backend · local artifact store    │
                    └──────────────────────────────────────────┘
```

*Figure 1: System architecture. Arrows indicate data flow direction.*

### 3.2 Data Model

The PostgreSQL schema comprises eight tables:

- **Project**: root entity; holds label definitions as a JSON array `[{name, color}]`.
- **DatasetVersion**: versioned snapshot of a dataset; stores `storage_path` (MinIO prefix), `label_type` (`none` | `human`), and file counts.
- **Trainer**: registered training framework; stores Pydantic JSON schemas for `train_params` and `infer_params`.
- **MLModel**: links a `Project` to a `Trainer`; represents a model family (e.g., "Pedestrian Detector — YOLO").
- **Checkpoint**: a saved model weights file in MinIO; `source` is `pretrained` (imported) or `experiment` (produced by training).
- **Experiment**: a training run; links `MLModel` + multiple `DatasetVersion` records (via `ExperimentDataset`); carries `train_params` JSON and `status`.
- **ExperimentDataset**: junction table; adds `role` (TRAIN | VALIDATION | TEST) and `sampling_weight`.
- **Evaluation**: an inference run of a checkpoint against one or more dataset versions; stores per-dataset and aggregate metrics.
- **Server**: a registered compute node; `server_type` (cpu | gpu), `status` (ONLINE | OFFLINE | UNKNOWN), hardware metadata.

```
Project ──< DatasetVersion
   │
   └──< MLModel >── Trainer
         │
         └──< Experiment >──< ExperimentDataset >── DatasetVersion
               │
               └──> Checkpoint (pretrained_ckpt_id, output_ckpt_id)

Evaluation >── Checkpoint
Evaluation >── MLModel
```

*Figure 2: Entity-relationship diagram (simplified).*

### 3.3 Trainer Plugin System

Adding a new training framework requires only one file: a Python module in `trainingworker/trainers/` that subclasses `BaseTrainer` and defines `TRAINER_KEY` and `TRAIN_PARAMS_CLASS`.

```
BaseTrainer[TP, IP]          (abstract, generic)
├── TRAINER_KEY: str          "yolo"
├── TRAIN_PARAMS_CLASS        YoloTrainParams
├── fit() → history           training loop (implemented in base)
├── load_dataset()            abstract
├── load_model()              abstract
├── configure_optimizer()     abstract
├── train_step(batch)         abstract
├── evaluate()                abstract
├── save_checkpoint()         abstract
└── load_checkpoint(path)     abstract

BaseTrainParams (Pydantic)
├── epochs, batch_size, learning_rate, weight_decay
├── device: "auto" | "cpu" | "cuda"
└── classes: list[str]        (ui_hidden=True)

YoloTrainParams(BaseTrainParams)
├── model_size: n|s|m|l|x    (ui_group="model")
├── img_size: int             (ui_group="model")
├── augment, mosaic           (ui_group="augmentation")
├── momentum, warmup_epochs   (ui_group="optimizer")
└── iou_threshold, conf_threshold  (ui_group="detection")
```

*Figure 3: Trainer class hierarchy and parameter schema structure.*

At container startup, `registry.py` scans `trainers/*_trainer.py` for `BaseTrainer` subclasses and POSTs their Pydantic JSON schemas to `POST /trainers/register`. The API stores these schemas in the `trainers` table. The frontend fetches the schema for the selected model's trainer and renders a grouped configuration form dynamically: fields with `ui_hidden: true` are omitted; fields with `ui_group` are grouped into collapsible sections; fields with `ui_options` render as `<select>` elements.

### 3.4 Experiment Lifecycle

```
User submits form
       │
       ▼
POST /experiments/
       │ validate, persist
       ▼
celery_app.send_task(
    "tasks.run_experiment",
    queue=f"server_{server_id}"   ← dedicated queue
)
       │
       ▼  Worker picks up
  PENDING ──► DOWNLOADING ──► RUNNING ──► COMPLETED
                                     └──► FAILED
                                     └──► CANCELLED
```

*Figure 4: Experiment state machine and dispatch flow.*

State transitions are reported back to the API via internal HTTP callbacks (`PATCH /experiments/{id}/progress`, `/complete`, `/fail`). The `ProgressReporter` context object wraps these callbacks and is injected into every `BaseTrainer` instance, so trainers call `self.reporter.update(epoch, total, metrics)` without knowledge of the HTTP layer.

On completion, `ProgressReporter.complete()` uploads the local checkpoint file to MinIO under `checkpoints/project_{id}/exp_{exp_id}/best.pt`, then calls `/complete` with the MinIO key. The API creates a `Checkpoint` record and links it to the experiment as `output_ckpt_id`.

### 3.5 Multi-Machine Worker Routing

Each worker invokes `startup.py` before launching Celery. The startup script:

1. Polls `GET /health` until the API is reachable (handles race conditions at cluster start).
2. Calls `POST /servers/` with name, host, and detected GPU count; on HTTP 409 (already registered), patches the existing record.
3. Receives the server's database `id` from the API response.
4. Appends `-Q celery,server_{id}` to the Celery worker command before `os.execvp`.

The API's experiment service builds the routing queue at dispatch time:

```python
queue = f"server_{server_id}" if str(server_id).isdigit() else "celery"
celery_app.send_task("tasks.run_experiment", args=[job_payload], queue=queue)
```

Remote workers communicate with MinIO and the API using endpoint values embedded in the job payload, resolved from `MINIO_WORKER_ENDPOINT` and `API_WORKER_URL` environment variables set on the API server. This allows workers on separate physical machines (connected via Tailscale overlay VPN) to receive tasks with correct endpoint addresses without any per-worker configuration of the API layer.

### 3.6 Storage Layout

All binary assets reside in MinIO, keeping the relational database lean:

```
datasets/
  project_{id}/
    {dataset_name}/{version}/
      files/          ← images
      annotations/    ← COCO JSON label files

checkpoints/
  project_{id}/
    imported/         ← pretrained checkpoints (source=pretrained)
    exp_{exp_id}/     ← training outputs (source=experiment)
```

### 3.7 Sampling Strategies

When an experiment references multiple TRAIN datasets, the `DataContext` merges them using one of three strategies:

- **CONCAT**: datasets are concatenated into a single PyTorch `ConcatDataset`.
- **WEIGHTED**: samples are drawn proportionally to `sampling_weight` values, enabling class-balanced training across unequally sized datasets.
- **ROUND_ROBIN**: batches alternate between datasets in a cyclic order, ensuring each dataset contributes equally per iteration regardless of size.

---

## 4. Experiments

### 4.1 Setup

The platform was deployed on two machines:

| Node | Role | Hardware |
|---|---|---|
| Machine 1 | API, MinIO, Redis, DB, local worker | Intel i7, 16 GB RAM |
| Machine 2 | GPU training worker | NVIDIA GPU, 8 GB VRAM |

Both machines are connected via Tailscale overlay VPN. Machine 2 runs only the training worker via `docker-compose.worker.yml`, which sets `network_mode: host` to enable Tailscale IP routing. The API on Machine 1 is configured with:

```
MINIO_WORKER_ENDPOINT=<tailscale_ip>:9000
API_WORKER_URL=http://<tailscale_ip>:8000
```

These values are injected into every job payload dispatched to Machine 2's queue (`server_2`), ensuring MinIO file downloads and progress callbacks resolve to Machine 1's public Tailscale IP rather than Docker-internal hostnames.

### 4.2 Dataset

A small object detection dataset was used for end-to-end validation:

- **Class**: pedestrian (1 class)
- **Images**: ~200 annotated images, COCO JSON format
- **Split**: 140 TRAIN / 30 VALIDATION / 30 TEST

Annotations were uploaded via the DatasetVersion upload-labels endpoint and stored in MinIO under the `annotations/` prefix.

### 4.3 Baselines

Since the YOLO trainer in this work uses a lightweight placeholder architecture (`_YoloNet`: 3-layer CNN backbone + 1×1 detection head) rather than a full YOLOv8/v9 network, quantitative mAP comparisons with published baselines are not reported. The primary evaluation targets are the platform's operational correctness and end-to-end pipeline reliability.

### 4.4 Results

**Routing correctness**: After implementing per-server queue routing, 10 experiments submitted targeting Machine 2 were verified by log inspection to be received and processed exclusively by the Machine 2 worker, with zero tasks misrouted to Machine 1's local worker.

**Endpoint resolution**: Before the `MINIO_WORKER_ENDPOINT` fix, 100% of experiments dispatched to Machine 2 failed at the DOWNLOADING stage with `NameResolutionError: minio:9000`. After the fix, 0 failures were observed at the dataset download stage.

**Checkpoint loading**: An `AssertionError` in `load_checkpoint()` caused by assigning the model to a local variable rather than `self.model` was identified and corrected. Post-fix, pretrained checkpoint loading succeeded in all tested configurations.

**Server busy warning**: When a second experiment was submitted targeting a server with an active experiment, the UI correctly displayed a warning banner within the server-select dropdown, listing the active experiment name and status, before the user submitted the form.

**MLflow integration**: Per-epoch `train_loss`, `val_loss`, and `mAP50` metrics were visible in the MLflow UI under experiment names `project_{id}`, with each training run appearing as a separate MLflow run (`exp_{id}`).

### 4.5 Analysis

The primary latency in experiment startup is dataset download from MinIO, which scales with dataset size. For the 200-image dataset over a Tailscale link, download completed in under 8 seconds. The Celery task queue adds negligible overhead (<1 s) for task routing.

The queue-based routing mechanism imposes one constraint: a worker's queue name is fixed for the lifetime of the process. If a server's database ID changes (e.g., after re-registration with a different name), the API would dispatch to a queue no longer listened to by the worker. The startup script handles this by patching rather than recreating server records on 409 Conflict, preserving the original `id` across restarts.

---

## 5. Discussion

### 5.1 Significance

The platform demonstrates that a production-grade ML training pipeline can be assembled from mature open-source components (FastAPI, Celery, MinIO, PostgreSQL, MLflow) without the operational complexity of Kubernetes. The Pydantic-to-UI schema bridge is particularly practical: adding a ResNet, ViT, or any other trainer requires no frontend code, reducing the typical "new model type" task from a cross-team effort to a single backend file.

The remote worker architecture via VPN is a meaningful contribution for organizations that have GPU hardware on-premises but need to orchestrate from a central server: it requires no firewall port opening beyond the VPN tunnel, and the security model is identical to a single-machine deployment.

### 5.2 Limitations

**Placeholder YOLO implementation**: The current `YoloTrainer` uses a three-layer CNN rather than a real YOLO backbone. Real mAP computation via `torchmetrics` or `pycocotools` is stubbed out with zeros. This is intentional scaffolding — the plugin interface is correct and a real YOLO backbone can be dropped in without API or frontend changes — but it means training results are not meaningful for actual detection tasks.

**No real-time log streaming**: Training logs are accessible only via `docker logs`. There is no WebSocket or SSE stream to surface them in the UI. Users monitoring long training runs must use the terminal.

**Single checkpoint per experiment**: The platform saves one checkpoint (`best.pt`) per experiment. Intermediate epoch checkpoints are not managed. Long training runs that are interrupted cannot be resumed from a mid-training checkpoint.

**No annotation UI**: Annotation import requires an external tool (Label Studio, CVAT) to produce COCO JSON, which is then uploaded via the API. There is no in-platform image labeling capability.

**No horizontal API scaling**: The API is a single FastAPI process. Under high load from multiple concurrent workers sending progress callbacks, this may become a bottleneck.

### 5.3 Future Work

**Visualization dashboard**: Implement per-experiment metric charts (train loss curve, mAP progression by epoch) directly in the Experiments page, pulling from MLflow's REST API or storing epoch-level metrics in the platform database. This removes the need to navigate to a separate MLflow URL for metric inspection and makes training progress legible to non-technical stakeholders without terminal access.

**CVAT integration**: Integrate with CVAT's REST API to support push-pull annotation workflows: users push an unlabeled `DatasetVersion` to a CVAT task, annotators label images in CVAT's purpose-built interface, and completed annotations are pulled back to the platform and attached to the dataset version automatically. This would close the annotation gap without requiring a separate login or manual JSON export, enabling a continuous data flywheel: train → evaluate → identify failure cases → annotate → retrain.

**Real YOLO backbone**: Replace `_YoloNet` with a true YOLOv8/v9 backbone using the Ultralytics library. Implement proper mAP computation in `evaluate_dataset()` using `torchmetrics.detection.MeanAveragePrecision` with COCO-standard IoU thresholds.

**Log streaming**: Add a WebSocket endpoint (`GET /experiments/{id}/logs/stream`) that tails Celery worker logs and forwards them to the browser in real time.

**Multi-checkpoint management**: Store intermediate checkpoints (every N epochs) in MinIO and expose them as `Checkpoint` records with `source=experiment_intermediate`, enabling experiment resume and targeted checkpoint selection for evaluation.

---

## 6. Conclusion

This paper presented a self-hosted MLOps platform for computer vision that integrates dataset versioning, distributed training orchestration, experiment tracking, checkpoint management, and compute node monitoring into a single deployable stack. The key architectural decisions — schema-driven trainer registration, per-worker Celery queue routing, and payload-embedded endpoint resolution — collectively enable a workflow where adding a new training framework requires one file, directing training to a specific machine requires one dropdown selection, and coordinating workers across physical machines requires only VPN connectivity and two environment variables.

The platform has been deployed and validated in a two-machine configuration with a CPU server and a GPU worker connected via Tailscale VPN, resolving three categories of production bugs identified during real-use testing: Docker-internal hostname leakage to remote workers, model assignment order errors in checkpoint loading, and task misrouting due to shared Celery queue names. The result is a reproducible, self-contained system suitable for small-to-medium computer vision teams operating in data-sensitive or resource-constrained environments.

Future integration of CVAT for annotation management and in-platform metric visualization will complete the data-to-model feedback loop, eliminating the remaining manual handoff steps in the computer vision ML workflow.

---

## References

- Zaharia, M., et al. (2018). *Accelerating the Machine Learning Lifecycle with MLflow*. IEEE Data Engineering Bulletin.
- Bisong, E. (2019). *Kubeflow and Kubeflow Pipelines*. In Building Machine Learning and Deep Learning Models on Google Cloud Platform. Apress.
- Kuprieiev, R., et al. (2020). *DVC: Data Version Control — Git for Data & Models*. Zenodo. doi:10.5281/zenodo.3677553
- Sekachev, B., et al. (2019). *Computer Vision Annotation Tool (CVAT)*. Zenodo. doi:10.5281/zenodo.4009388
- Jocher, G., et al. (2023). *Ultralytics YOLOv8*. GitHub. https://github.com/ultralytics/ultralytics
- Lin, T.-Y., et al. (2014). *Microsoft COCO: Common Objects in Context*. ECCV 2014. Springer.
- Paszke, A., et al. (2019). *PyTorch: An Imperative Style, High-Performance Deep Learning Library*. NeurIPS 2019.
- FastAPI. (2023). *FastAPI framework, high performance, easy to learn*. https://fastapi.tiangolo.com
