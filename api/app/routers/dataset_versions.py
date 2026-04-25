from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import dataset_versions as dv_models
from ..models import projects as project_models
from pydantic import BaseModel
from typing import Optional, List
import io

from ..services.minio_client import get_minio_client, ensure_bucket

BUCKET_NAME = "datasets"

router = APIRouter(prefix="/dataset-versions", tags=["dataset-versions"])

class DatasetVersionCreate(BaseModel):
    project_id: int
    name: str
    version: str
    description: Optional[str] = None


@router.post("/")
async def create_dataset_version(
    project_id: int = Form(...),
    name: str = Form(...),
    version: str = Form(...),
    description: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
):
    # Kiểm tra project có tồn tại không
    project = db.query(project_models.Project).filter(project_models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Tạo storage_path theo format yêu cầu
    storage_path = f"datasets/project_{project_id}/{name}/{version}/"

    db_dv = dv_models.DatasetVersion(
        project_id=project_id,
        name=name,
        version=version,
        description=description,
        storage_path=storage_path,
    )
    db.add(db_dv)
    db.commit()
    db.refresh(db_dv)

    # Ensure bucket exists then upload files under {storage_path}files/
    ensure_bucket(BUCKET_NAME)
    client = get_minio_client()
    if files:
        for f in files:
            contents = await f.read()
            object_name = f"{storage_path}files/{f.filename}"
            client.put_object(
                BUCKET_NAME,
                object_name,
                io.BytesIO(contents),
                length=len(contents),
                content_type=f.content_type or "application/octet-stream",
            )

    return db_dv

@router.get("/")
def get_all_dataset_versions(project_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(dv_models.DatasetVersion)
    if project_id:
        query = query.filter(dv_models.DatasetVersion.project_id == project_id)
    return query.all()

@router.get("/{dv_id}")
def get_dataset_version_details(dv_id: int, db: Session = Depends(get_db)):
    dv = db.query(dv_models.DatasetVersion).filter(dv_models.DatasetVersion.id == dv_id).first()
    if not dv:
        raise HTTPException(status_code=404, detail="Dataset version not found")
    return dv


@router.post("/{dv_id}/upload-labels")
async def upload_labels(dv_id: int, files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    dv = db.query(dv_models.DatasetVersion).filter(dv_models.DatasetVersion.id == dv_id).first()
    if not dv:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    # Upload to {storage_path}annotations/
    ensure_bucket(BUCKET_NAME)
    client = get_minio_client()
    for f in files:
        contents = await f.read()
        object_name = f"{dv.storage_path}annotations/{f.filename}"
        client.put_object(
            BUCKET_NAME,
            object_name,
            io.BytesIO(contents),
            length=len(contents),
            content_type=f.content_type or "application/octet-stream",
        )

    # After uploading labels, set label_type to 'human'
    dv.label_type = 'human'
    db.add(dv)
    db.commit()
    db.refresh(dv)
    return dv