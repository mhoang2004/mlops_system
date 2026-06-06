from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.models import projects, dataset_versions, checkpoints, experiments, servers, trainers, ml_models  # noqa: F401
from app.routers import projects as projects_router
from app.routers import dataset_versions as dv_router
from app.routers import checkpoints as ckpt_router
from app.routers import experiments as exp_router
from app.routers import servers as srv_router
from app.routers import trainers as trainer_router
from app.routers import ml_models as mlmodel_router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MLOps API",
    description="Dataset management, checkpoints, experiment tracking, and server management",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router.router)
app.include_router(dv_router.router)
app.include_router(ckpt_router.router)
app.include_router(exp_router.router)
app.include_router(srv_router.router)
app.include_router(trainer_router.router)
app.include_router(mlmodel_router.router)


@app.get("/", tags=["health"])
def root():
    return {"message": "MLOps API", "version": "1.0.0"}


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
