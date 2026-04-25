from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import projects, dataset_versions

app = FastAPI(title="MLOps API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # hoặc ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Đăng ký các router
app.include_router(projects.router)
app.include_router(dataset_versions.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to MLOps API"}