from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import servers as service

router = APIRouter(prefix="/servers", tags=["servers"])


class ServerCreate(BaseModel):
    name: str
    host: str
    node_exporter_port: int = Field(default=9100, ge=1, le=65535)
    cadvisor_port: int = Field(default=8080, ge=1, le=65535)
    dcgm_exporter_port: Optional[int] = Field(default=None, ge=1, le=65535)
    description: Optional[str] = None
    gpu_count: int = Field(default=0, ge=0)
    gpu_type: Optional[str] = None
    server_type: Literal['cpu', 'gpu'] = 'cpu'


class ServerUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    node_exporter_port: Optional[int] = Field(default=None, ge=1, le=65535)
    cadvisor_port: Optional[int] = Field(default=None, ge=1, le=65535)
    dcgm_exporter_port: Optional[int] = Field(default=None, ge=1, le=65535)
    description: Optional[str] = None
    gpu_count: Optional[int] = Field(default=None, ge=0)
    gpu_type: Optional[str] = None
    server_type: Optional[Literal['cpu', 'gpu']] = None


@router.post("/", status_code=201)
def create_server(body: ServerCreate, db: Session = Depends(get_db)):
    return service.create_server(
        db,
        name=body.name,
        host=body.host,
        node_exporter_port=body.node_exporter_port,
        cadvisor_port=body.cadvisor_port,
        dcgm_exporter_port=body.dcgm_exporter_port,
        description=body.description,
        gpu_count=body.gpu_count,
        gpu_type=body.gpu_type,
        server_type=body.server_type,
    )


@router.get("/")
def list_servers(db: Session = Depends(get_db)):
    return service.list_servers(db)


@router.get("/{server_id}")
def get_server(server_id: int, db: Session = Depends(get_db)):
    return service.get_server(db, server_id)


@router.patch("/{server_id}")
def update_server(server_id: int, body: ServerUpdate, db: Session = Depends(get_db)):
    return service.update_server(
        db,
        server_id,
        name=body.name,
        host=body.host,
        node_exporter_port=body.node_exporter_port,
        cadvisor_port=body.cadvisor_port,
        dcgm_exporter_port=body.dcgm_exporter_port,
        description=body.description,
        gpu_count=body.gpu_count,
        gpu_type=body.gpu_type,
        server_type=body.server_type,
    )


@router.delete("/{server_id}", status_code=204)
def delete_server(server_id: int, db: Session = Depends(get_db)):
    service.delete_server(db, server_id)
    return Response(status_code=204)


@router.get("/{server_id}/health")
def check_health(server_id: int, db: Session = Depends(get_db)):
    """Ping all exporters and return reachability status."""
    return service.check_health(db, server_id)


@router.get("/{server_id}/metrics")
def get_metrics(
    server_id: int,
    include_containers: bool = Query(default=False, description="Include per-container stats from cadvisor"),
    db: Session = Depends(get_db),
):
    """
    Fetch live metrics from node-exporter, DCGM, and optionally cadvisor.
    Updates server status (ONLINE/OFFLINE) in DB as a side effect.
    """
    return service.get_metrics(db, server_id, include_containers=include_containers)
