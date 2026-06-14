from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func

from ..database import Base


class Server(Base):
    __tablename__ = "servers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    host = Column(String(255), nullable=False)
    node_exporter_port = Column(Integer, default=9100, nullable=False)
    cadvisor_port = Column(Integer, default=8080, nullable=False)
    dcgm_exporter_port = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    gpu_count = Column(Integer, default=0)
    gpu_type = Column(String(255), nullable=True)
    # cpu / gpu
    server_type = Column(String(10), server_default='cpu', nullable=False)
    # ONLINE / OFFLINE / UNKNOWN
    status = Column(String(50), default="UNKNOWN", nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
