import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.servers import Server
from ..repositories import servers as repo

_FETCH_TIMEOUT = 5.0  # seconds


# ---------------------------------------------------------------------------
# Prometheus text-format parser
# ---------------------------------------------------------------------------

def _parse_prometheus(text: str) -> Dict[str, List[Dict[str, Any]]]:
    result: Dict[str, List[Dict[str, Any]]] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([^\s]+)", line)
        if not m:
            continue
        name = m.group(1)
        labels_str = m.group(2) or ""
        val_str = m.group(3)
        try:
            value = float(val_str)
        except ValueError:
            continue
        labels: Dict[str, str] = {
            lm.group(1): lm.group(2)
            for lm in re.finditer(r'(\w+)="([^"]*)"', labels_str)
        }
        result.setdefault(name, []).append({"labels": labels, "value": value})
    return result


def _first(parsed: Dict, metric: str) -> Optional[float]:
    entries = parsed.get(metric, [])
    return entries[0]["value"] if entries else None


# ---------------------------------------------------------------------------
# Per-exporter metric extractors
# ---------------------------------------------------------------------------

def _node_metrics(parsed: Dict) -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    # Memory
    mem_total = _first(parsed, "node_memory_MemTotal_bytes")
    mem_avail = _first(parsed, "node_memory_MemAvailable_bytes")
    if mem_total and mem_avail:
        mem_used = mem_total - mem_avail
        out["memory"] = {
            "total_bytes": int(mem_total),
            "used_bytes": int(mem_used),
            "free_bytes": int(mem_avail),
            "usage_percent": round(mem_used / mem_total * 100, 1),
        }

    # CPU: load averages + core count
    cpu_entries = parsed.get("node_cpu_seconds_total", [])
    core_count = len({e["labels"].get("cpu", "") for e in cpu_entries if e["labels"].get("mode") == "idle"})
    load1 = _first(parsed, "node_load1")
    load5 = _first(parsed, "node_load5")
    load15 = _first(parsed, "node_load15")
    if load1 is not None or core_count:
        out["cpu"] = {
            "core_count": core_count or None,
            "load_avg_1m": round(load1, 2) if load1 is not None else None,
            "load_avg_5m": round(load5, 2) if load5 is not None else None,
            "load_avg_15m": round(load15, 2) if load15 is not None else None,
        }

    # Disks
    sizes = {e["labels"].get("mountpoint"): e["value"] for e in parsed.get("node_filesystem_size_bytes", [])}
    avails = {e["labels"].get("mountpoint"): e["value"] for e in parsed.get("node_filesystem_avail_bytes", [])}
    disks = []
    for mount, total in sizes.items():
        if total == 0:
            continue
        free = avails.get(mount, 0)
        used = total - free
        disks.append({
            "mountpoint": mount,
            "total_bytes": int(total),
            "used_bytes": int(used),
            "free_bytes": int(free),
            "usage_percent": round(used / total * 100, 1),
        })
    if disks:
        out["disks"] = sorted(disks, key=lambda x: x["mountpoint"])

    # Network I/O (total across all non-loopback interfaces)
    rx_entries = parsed.get("node_network_receive_bytes_total", [])
    tx_entries = parsed.get("node_network_transmit_bytes_total", [])
    rx_total = sum(e["value"] for e in rx_entries if e["labels"].get("device", "") != "lo")
    tx_total = sum(e["value"] for e in tx_entries if e["labels"].get("device", "") != "lo")
    if rx_total or tx_total:
        out["network"] = {
            "receive_bytes_total": int(rx_total),
            "transmit_bytes_total": int(tx_total),
        }

    return out


def _dcgm_metrics(parsed: Dict) -> List[Dict[str, Any]]:
    gpu_data: Dict[str, Dict[str, Any]] = {}

    _DCGM_MAP = {
        "DCGM_FI_DEV_GPU_UTIL": "utilization_percent",
        "DCGM_FI_DEV_MEM_COPY_UTIL": "mem_copy_util_percent",
        "DCGM_FI_DEV_FB_USED": "memory_used_mb",
        "DCGM_FI_DEV_FB_FREE": "memory_free_mb",
        "DCGM_FI_DEV_GPU_TEMP": "temperature_celsius",
        "DCGM_FI_DEV_POWER_USAGE": "power_watts",
        "DCGM_FI_DEV_PCIE_TX_THROUGHPUT": "pcie_tx_kb_s",
        "DCGM_FI_DEV_PCIE_RX_THROUGHPUT": "pcie_rx_kb_s",
        "DCGM_FI_DEV_SM_CLOCK": "sm_clock_mhz",
        "DCGM_FI_DEV_MEM_CLOCK": "mem_clock_mhz",
    }

    for dcgm_name, field in _DCGM_MAP.items():
        for entry in parsed.get(dcgm_name, []):
            gpu_idx = entry["labels"].get("gpu", "0")
            if gpu_idx not in gpu_data:
                gpu_data[gpu_idx] = {
                    "index": int(gpu_idx),
                    "model": entry["labels"].get("modelName", "Unknown"),
                    "uuid": entry["labels"].get("UUID", None),
                }
            gpu_data[gpu_idx][field] = round(entry["value"], 2)

    for gpu in gpu_data.values():
        used = gpu.get("memory_used_mb", 0)
        free = gpu.get("memory_free_mb", 0)
        total = used + free
        if total > 0:
            gpu["memory_total_mb"] = round(total, 1)
            gpu["memory_usage_percent"] = round(used / total * 100, 1)

    return sorted(gpu_data.values(), key=lambda x: x["index"])


def _cadvisor_container_metrics(parsed: Dict) -> List[Dict[str, Any]]:
    """Extract per-container CPU and memory usage from cadvisor."""
    containers: Dict[str, Dict[str, Any]] = {}

    for entry in parsed.get("container_memory_usage_bytes", []):
        name = entry["labels"].get("name", "")
        if not name:
            continue
        containers.setdefault(name, {"name": name})
        containers[name]["memory_bytes"] = int(entry["value"])

    for entry in parsed.get("container_cpu_usage_seconds_total", []):
        name = entry["labels"].get("name", "")
        if not name:
            continue
        containers.setdefault(name, {"name": name})
        containers[name]["cpu_seconds_total"] = round(entry["value"], 3)

    for entry in parsed.get("container_memory_limit_bytes", []):
        name = entry["labels"].get("name", "")
        if not name or entry["value"] <= 0:
            continue
        if name in containers:
            containers[name]["memory_limit_bytes"] = int(entry["value"])

    return sorted(containers.values(), key=lambda x: x["name"])


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def _fetch(url: str) -> Optional[str]:
    try:
        r = httpx.get(url, timeout=_FETCH_TIMEOUT)
        r.raise_for_status()
        return r.text
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------

def list_servers(db: Session) -> List[Server]:
    return repo.get_all(db)


def get_server(db: Session, server_id: int) -> Server:
    server = repo.get_by_id(db, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return server


def create_server(
    db: Session,
    name: str,
    host: str,
    node_exporter_port: int = 9100,
    cadvisor_port: int = 8080,
    dcgm_exporter_port: Optional[int] = None,
    description: Optional[str] = None,
    gpu_count: int = 0,
    gpu_type: Optional[str] = None,
) -> Server:
    if repo.get_by_name(db, name):
        raise HTTPException(status_code=409, detail=f"Server name '{name}' already exists")
    return repo.create(
        db, name, host, node_exporter_port, cadvisor_port,
        dcgm_exporter_port, description, gpu_count, gpu_type,
    )


def update_server(
    db: Session,
    server_id: int,
    name: Optional[str],
    host: Optional[str],
    node_exporter_port: Optional[int],
    cadvisor_port: Optional[int],
    dcgm_exporter_port: Optional[int],
    description: Optional[str],
    gpu_count: Optional[int],
    gpu_type: Optional[str],
) -> Server:
    server = get_server(db, server_id)
    if name and name != server.name and repo.get_by_name(db, name):
        raise HTTPException(status_code=409, detail=f"Server name '{name}' already exists")
    return repo.update(
        db, server, name, host, node_exporter_port, cadvisor_port,
        dcgm_exporter_port, description, gpu_count, gpu_type,
    )


def delete_server(db: Session, server_id: int) -> None:
    server = get_server(db, server_id)
    repo.delete(db, server)


def check_health(db: Session, server_id: int) -> Dict[str, Any]:
    server = get_server(db, server_id)
    node_url = f"http://{server.host}:{server.node_exporter_port}/metrics"
    reachable = _fetch(node_url) is not None
    status = "ONLINE" if reachable else "OFFLINE"
    repo.set_status(db, server, status)
    return {
        "server_id": server_id,
        "host": server.host,
        "status": status,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "exporters": {
            "node_exporter": f"http://{server.host}:{server.node_exporter_port}",
            "cadvisor": f"http://{server.host}:{server.cadvisor_port}",
            "dcgm_exporter": (
                f"http://{server.host}:{server.dcgm_exporter_port}"
                if server.dcgm_exporter_port else None
            ),
        },
    }


def get_metrics(db: Session, server_id: int, include_containers: bool = False) -> Dict[str, Any]:
    server = get_server(db, server_id)

    result: Dict[str, Any] = {
        "server_id": server_id,
        "server_name": server.name,
        "host": server.host,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "online": False,
    }

    # node-exporter
    node_text = _fetch(f"http://{server.host}:{server.node_exporter_port}/metrics")
    if node_text:
        result["online"] = True
        result.update(_node_metrics(_parse_prometheus(node_text)))
        repo.set_status(db, server, "ONLINE")
    else:
        repo.set_status(db, server, "OFFLINE")
        return result

    # DCGM (GPU)
    if server.dcgm_exporter_port:
        dcgm_text = _fetch(f"http://{server.host}:{server.dcgm_exporter_port}/metrics")
        if dcgm_text:
            gpus = _dcgm_metrics(_parse_prometheus(dcgm_text))
            if gpus:
                result["gpus"] = gpus

    # cadvisor (containers) — optional, can be large
    if include_containers:
        cadv_text = _fetch(f"http://{server.host}:{server.cadvisor_port}/metrics")
        if cadv_text:
            containers = _cadvisor_container_metrics(_parse_prometheus(cadv_text))
            if containers:
                result["containers"] = containers

    return result
