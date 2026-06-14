from typing import List, Optional

from sqlalchemy.orm import Session

from ..models.servers import Server


def get_all(db: Session) -> List[Server]:
    return db.query(Server).order_by(Server.name).all()


def get_by_id(db: Session, server_id: int) -> Optional[Server]:
    return db.query(Server).filter(Server.id == server_id).first()


def get_by_name(db: Session, name: str) -> Optional[Server]:
    return db.query(Server).filter(Server.name == name).first()


def create(
    db: Session,
    name: str,
    host: str,
    node_exporter_port: int,
    cadvisor_port: int,
    dcgm_exporter_port: Optional[int],
    description: Optional[str],
    gpu_count: int,
    gpu_type: Optional[str],
    server_type: str = 'cpu',
) -> Server:
    server = Server(
        name=name,
        host=host,
        node_exporter_port=node_exporter_port,
        cadvisor_port=cadvisor_port,
        dcgm_exporter_port=dcgm_exporter_port,
        description=description,
        gpu_count=gpu_count,
        gpu_type=gpu_type,
        server_type=server_type,
        status="UNKNOWN",
    )
    db.add(server)
    db.commit()
    db.refresh(server)
    return server


def update(
    db: Session,
    server: Server,
    name: Optional[str],
    host: Optional[str],
    node_exporter_port: Optional[int],
    cadvisor_port: Optional[int],
    dcgm_exporter_port: Optional[int],
    description: Optional[str],
    gpu_count: Optional[int],
    gpu_type: Optional[str],
    server_type: Optional[str] = None,
) -> Server:
    if name is not None:
        server.name = name
    if host is not None:
        server.host = host
    if node_exporter_port is not None:
        server.node_exporter_port = node_exporter_port
    if cadvisor_port is not None:
        server.cadvisor_port = cadvisor_port
    if dcgm_exporter_port is not None:
        server.dcgm_exporter_port = dcgm_exporter_port
    if description is not None:
        server.description = description
    if gpu_count is not None:
        server.gpu_count = gpu_count
    if gpu_type is not None:
        server.gpu_type = gpu_type
    if server_type is not None:
        server.server_type = server_type
    db.commit()
    db.refresh(server)
    return server


def set_status(db: Session, server: Server, status: str) -> Server:
    server.status = status
    db.commit()
    db.refresh(server)
    return server


def delete(db: Session, server: Server) -> None:
    db.delete(server)
    db.commit()
