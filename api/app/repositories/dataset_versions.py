from typing import List, Optional

from sqlalchemy.orm import Session

from ..models.dataset_versions import DatasetVersion


def get_all(db: Session, project_id: Optional[int] = None) -> List[DatasetVersion]:
    q = db.query(DatasetVersion)
    if project_id is not None:
        q = q.filter(DatasetVersion.project_id == project_id)
    return q.all()


def get_by_id(db: Session, dv_id: int) -> Optional[DatasetVersion]:
    return db.query(DatasetVersion).filter(DatasetVersion.id == dv_id).first()


def create(
    db: Session,
    project_id: int,
    name: str,
    version: str,
    description: Optional[str],
    storage_path: str,
) -> DatasetVersion:
    dv = DatasetVersion(
        project_id=project_id,
        name=name,
        version=version,
        description=description,
        storage_path=storage_path,
    )
    db.add(dv)
    db.commit()
    db.refresh(dv)
    return dv


def update(
    db: Session,
    dv: DatasetVersion,
    name: Optional[str],
    version: Optional[str],
    description: Optional[str],
) -> DatasetVersion:
    if name is not None:
        dv.name = name
    if version is not None:
        dv.version = version
    if description is not None:
        dv.description = description
    db.commit()
    db.refresh(dv)
    return dv


def delete(db: Session, dv: DatasetVersion) -> None:
    db.delete(dv)
    db.commit()


def set_label_type(db: Session, dv: DatasetVersion, label_type: str) -> DatasetVersion:
    dv.label_type = label_type
    db.add(dv)
    db.commit()
    db.refresh(dv)
    return dv
