from typing import Any, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.projects import Project
from ..repositories import projects as repo
from ..repositories import dataset_versions as dv_repo
from ..repositories import checkpoints as ckpt_repo
from ..repositories import experiments as exp_repo


def list_projects(db: Session) -> List[Project]:
    return repo.get_all(db)


def get_project(db: Session, project_id: int) -> Project:
    project = repo.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def create_project(db: Session, name: str, labels: Any, description: Optional[str] = None) -> Project:
    return repo.create(db, name, labels, description)


def update_project(
    db: Session,
    project_id: int,
    name: Optional[str],
    labels: Optional[Any],
    description: Optional[str] = None,
) -> Project:
    project = get_project(db, project_id)
    return repo.update(db, project, name, labels, description)


def delete_project(db: Session, project_id: int) -> None:
    """
    Delete project and cascade-delete all associated data in MinIO.
    DB foreign-key cascades handle dataset_versions, checkpoints, experiments rows.
    MinIO objects must be cleaned up manually.
    """
    from common.minio_client import get_minio_client

    project = get_project(db, project_id)
    client  = get_minio_client()

    # Delete all MinIO objects under datasets/project_{id}/
    for bucket, prefix in [
        ("datasets",    f"datasets/project_{project_id}/"),
        ("checkpoints", f"checkpoints/project_{project_id}/"),
    ]:
        try:
            objects = list(client.list_objects(bucket, prefix=prefix, recursive=True))
            for obj in objects:
                client.remove_object(bucket, obj.object_name)
        except Exception:
            pass  # bucket may not exist yet in dev

    repo.delete(db, project)


def get_project_stats(db: Session, project_id: int) -> dict:
    """Aggregate counts for the project dashboard."""
    get_project(db, project_id)  # 404 if not found

    versions     = dv_repo.get_all(db, project_id)
    checkpoints  = ckpt_repo.get_all(db, project_id)
    experiments  = exp_repo.list_by_project(db, project_id)

    labeled_count   = sum(1 for v in versions if v.label_type == "human")
    unlabeled_count = len(versions) - labeled_count

    exp_by_status: dict[str, int] = {}
    for exp in experiments:
        exp_by_status[exp.status] = exp_by_status.get(exp.status, 0) + 1

    return {
        "dataset_versions": {
            "total":     len(versions),
            "labeled":   labeled_count,
            "unlabeled": unlabeled_count,
        },
        "checkpoints": {
            "total":      len(checkpoints),
            "pretrained": sum(1 for c in checkpoints if c.source == "pretrained"),
            "experiment": sum(1 for c in checkpoints if c.source == "experiment"),
        },
        "experiments": {
            "total":      len(experiments),
            "by_status":  exp_by_status,
        },
    }
