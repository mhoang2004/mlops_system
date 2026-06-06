"""
UI-facing parameter schemas for each trainer type.

Each param defines:
  key         — matches the key expected in train_params JSON
  label       — short human-readable name
  type        — "integer" | "float" | "boolean" | "select" | "string"
  default     — default value shown in UI
  description — explains what the param does (shown as hint on UI)
  group       — logical section: "training" | "model" | "optimizer" | "augmentation" | "hardware" | "thresholds"
  min/max     — for numeric types
  step        — increment for float inputs
  options     — list of allowed values for "select" type
"""

from typing import Any, Dict, List, Optional

# Type alias for a single param definition
ParamDef = Dict[str, Any]


def _p(
    key: str,
    label: str,
    type_: str,
    default: Any,
    description: str,
    group: str,
    *,
    min: Optional[float] = None,
    max: Optional[float] = None,
    step: Optional[float] = None,
    options: Optional[List] = None,
) -> ParamDef:
    d: ParamDef = {
        "key": key,
        "label": label,
        "type": type_,
        "default": default,
        "description": description,
        "group": group,
    }
    if min is not None:
        d["min"] = min
    if max is not None:
        d["max"] = max
    if step is not None:
        d["step"] = step
    if options is not None:
        d["options"] = options
    return d


# ── Base params shared across all trainers ────────────────────────────────────

_BASE_PARAMS: List[ParamDef] = [
    _p("epochs", "Epochs", "integer", 50,
       "Số vòng lặp huấn luyện qua toàn bộ dataset. Nhiều epoch hơn có thể cải thiện độ chính xác nhưng tốn thêm thời gian và có nguy cơ overfitting.",
       "training", min=1, max=2000),

    _p("batch_size", "Batch Size", "integer", 16,
       "Số ảnh được xử lý trong mỗi bước gradient. Batch lớn hơn giúp training ổn định hơn nhưng đòi hỏi nhiều RAM/VRAM. Nếu bị OOM, giảm giá trị này.",
       "training", min=1, max=512),

    _p("learning_rate", "Learning Rate", "float", 0.001,
       "Tốc độ học của optimizer. Giá trị lớn = học nhanh nhưng có thể không hội tụ. Giá trị nhỏ = ổn định hơn nhưng chậm. Thường dùng: 1e-3 (Adam), 1e-2 (SGD).",
       "optimizer", min=0.000001, max=1.0, step=0.0001),

    _p("weight_decay", "Weight Decay", "float", 0.0001,
       "L2 regularization (penalty cho trọng số lớn) để tránh overfitting. Giá trị 0 = tắt. Thường dùng 1e-4 đến 5e-4.",
       "optimizer", min=0.0, max=0.1, step=0.00001),

    _p("device", "Device", "select", "auto",
       "Thiết bị để training. 'auto' = tự chọn GPU nếu có, ngược lại dùng CPU. 'cuda:0' = GPU đầu tiên. 'cuda:0,1' = multi-GPU.",
       "hardware", options=["auto", "cpu", "cuda", "cuda:0", "cuda:1", "cuda:0,1"]),
]


# ── YOLO trainer ──────────────────────────────────────────────────────────────

YOLO_SCHEMA = {
    "trainer_type": "yolo",
    "display_name": "YOLO — Object Detection",
    "description": "You Only Look Once: real-time single-stage object detection. Nhanh, chính xác cao, phù hợp production.",
    "params": [
        *_BASE_PARAMS,

        # Model
        _p("model_size", "Model Size", "select", "n",
           "Kích thước kiến trúc YOLO. n (nano) = nhỏ nhất/nhanh nhất. x (extra-large) = lớn nhất/chính xác nhất. Chọn dựa trên tài nguyên GPU và yêu cầu tốc độ inference.",
           "model", options=["n", "s", "m", "l", "x"]),

        _p("img_size", "Image Size (px)", "select", 640,
           "Kích thước ảnh đầu vào (pixel, vuông). Ảnh lớn hơn giúp phát hiện vật thể nhỏ tốt hơn nhưng cần nhiều VRAM và chậm hơn. Thường dùng 640.",
           "model", options=[320, 416, 512, 640, 832, 1024, 1280]),

        # Optimizer (YOLO-specific)
        _p("momentum", "SGD Momentum", "float", 0.937,
           "Momentum cho SGD optimizer. Giúp vượt qua local minima và tăng tốc hội tụ theo hướng gradient nhất quán. Thường để mặc định.",
           "optimizer", min=0.0, max=1.0, step=0.001),

        _p("warmup_epochs", "Warmup Epochs", "integer", 3,
           "Số epoch đầu dùng learning rate nhỏ dần (warmup) trước khi đạt lr chính. Giúp model khởi động ổn định. Đặt 0 để tắt.",
           "optimizer", min=0, max=20),

        _p("lr_final", "Final LR Ratio", "float", 0.01,
           "Tỷ lệ learning rate cuối so với lr ban đầu (cosine decay schedule). Ví dụ 0.01 nghĩa là lr cuối = lr_initial × 0.01.",
           "optimizer", min=0.0001, max=1.0, step=0.001),

        # Augmentation
        _p("augment", "Augmentation", "boolean", True,
           "Bật tự động augmentation: mosaic, random flip ngang, HSV color jitter, scale, translate. Giúp model tổng quát hóa tốt hơn với data đa dạng.",
           "augmentation"),

        _p("mosaic", "Mosaic Probability", "float", 1.0,
           "Xác suất áp dụng mosaic augmentation (ghép 4 ảnh thành 1). Rất hiệu quả để học context đa dạng và vật thể nhỏ. Đặt 0 để tắt.",
           "augmentation", min=0.0, max=1.0, step=0.1),

        # Thresholds
        _p("patience", "Early Stop Patience", "integer", 50,
           "Số epoch liên tiếp không cải thiện mAP50 thì dừng sớm. Tiết kiệm thời gian khi model đã hội tụ. Đặt 0 để tắt early stopping.",
           "thresholds", min=0, max=500),

        _p("iou_threshold", "NMS IoU Threshold", "float", 0.45,
           "Ngưỡng IoU cho Non-Maximum Suppression khi train. Box có IoU > ngưỡng này với box tốt nhất sẽ bị loại. Thấp hơn = aggressive suppression.",
           "thresholds", min=0.0, max=1.0, step=0.05),

        _p("conf_threshold", "Confidence Threshold (train)", "float", 0.001,
           "Ngưỡng confidence khi tính loss lúc training (rất thấp để không bỏ sót detection). Khác với threshold khi inference.",
           "thresholds", min=0.0001, max=0.5, step=0.001),

        _p("dropout", "Dropout", "float", 0.0,
           "Tỷ lệ dropout regularization trong head của model. 0 = tắt. Chỉ nên dùng khi overfitting nghiêm trọng và dataset nhỏ.",
           "thresholds", min=0.0, max=0.5, step=0.05),
    ],
}


# ── ResNet trainer ────────────────────────────────────────────────────────────

RESNET_SCHEMA = {
    "trainer_type": "resnet",
    "display_name": "ResNet — Image Classification",
    "description": "Residual Network cho bài toán phân loại ảnh. Phù hợp khi output là 1 nhãn duy nhất cho toàn bộ ảnh.",
    "params": [
        *_BASE_PARAMS,

        _p("resnet_variant", "ResNet Variant", "select", "resnet50",
           "Kiến trúc ResNet cụ thể. Số lớn hơn = nhiều layer hơn, chính xác hơn nhưng chậm hơn. ResNet50 là lựa chọn cân bằng tốt.",
           "model", options=["resnet18", "resnet34", "resnet50", "resnet101", "resnet152"]),

        _p("pretrained", "ImageNet Pretrained", "boolean", True,
           "Dùng weights đã pretrained trên ImageNet. Giúp hội tụ nhanh hơn nhiều và cho kết quả tốt hơn với dataset nhỏ (transfer learning).",
           "model"),

        _p("img_size", "Image Size (px)", "select", 224,
           "Kích thước ảnh đầu vào. ResNet gốc dùng 224×224. Ảnh lớn hơn có thể cải thiện accuracy nhưng cần nhiều memory hơn.",
           "model", options=[224, 256, 320, 384, 448]),

        _p("scheduler", "LR Scheduler", "select", "cosine",
           "Chiến lược giảm learning rate theo epoch. cosine = giảm mượt theo hình sin. step = giảm đột ngột theo bước. none = learning rate cố định.",
           "optimizer", options=["cosine", "step", "none"]),

        _p("label_smoothing", "Label Smoothing", "float", 0.1,
           "Kỹ thuật regularization làm mềm ground truth labels. Giúp tránh overconfidence. 0 = tắt. Thường dùng 0.1.",
           "optimizer", min=0.0, max=0.5, step=0.05),

        _p("patience", "Early Stop Patience", "integer", 20,
           "Số epoch không cải thiện validation accuracy thì dừng.",
           "thresholds", min=0, max=200),

        _p("dropout", "Dropout (FC layer)", "float", 0.5,
           "Dropout trước fully-connected layer cuối. Rất quan trọng cho classification để tránh overfitting.",
           "thresholds", min=0.0, max=0.9, step=0.1),
    ],
}


# ── EfficientDet trainer ──────────────────────────────────────────────────────

EFFICIENTDET_SCHEMA = {
    "trainer_type": "efficientdet",
    "display_name": "EfficientDet — Object Detection",
    "description": "EfficientDet là detector hiệu quả với BiFPN neck. Cân bằng tốt giữa accuracy và speed, phù hợp edge deployment.",
    "params": [
        *_BASE_PARAMS,

        _p("compound_coef", "Compound Coefficient", "select", 0,
           "Hệ số scaling D0–D7. D0 = nhỏ nhất/nhanh nhất (512px). D7 = lớn nhất (1536px). Mỗi bậc tăng ~2× FLOPs.",
           "model", options=[0, 1, 2, 3, 4, 5, 6, 7]),

        _p("img_size", "Image Size (px)", "integer", 512,
           "Kích thước ảnh. Thường do compound_coef quyết định: D0=512, D1=640, D2=768, D3=896... Có thể override ở đây.",
           "model", min=128, max=1920, step=32),

        _p("momentum", "SGD Momentum", "float", 0.9,
           "Momentum cho SGD. Giúp optimizer duy trì direction khi gradient nhiễu.",
           "optimizer", min=0.0, max=1.0, step=0.01),

        _p("patience", "Early Stop Patience", "integer", 30,
           "Số epoch không cải thiện mAP thì dừng.",
           "thresholds", min=0, max=200),

        _p("iou_threshold", "NMS IoU Threshold", "float", 0.5,
           "Ngưỡng IoU cho NMS. Cao hơn = ít suppression hơn, có thể có nhiều box trùng. Thấp hơn = aggressive.",
           "thresholds", min=0.0, max=1.0, step=0.05),
    ],
}


# ── Custom trainer ────────────────────────────────────────────────────────────

CUSTOM_SCHEMA = {
    "trainer_type": "custom",
    "display_name": "Custom Trainer",
    "description": "Dùng khi triển khai trainer tự định nghĩa. Các tham số cơ bản vẫn bắt buộc.",
    "params": [*_BASE_PARAMS],
}


# ── Registry ──────────────────────────────────────────────────────────────────

_REGISTRY: Dict[str, dict] = {
    "yolo":         YOLO_SCHEMA,
    "resnet":       RESNET_SCHEMA,
    "efficientdet": EFFICIENTDET_SCHEMA,
    "custom":       CUSTOM_SCHEMA,
}

GROUP_ORDER = ["training", "model", "optimizer", "augmentation", "hardware", "thresholds"]

GROUP_LABELS = {
    "training":     "Training",
    "model":        "Model",
    "optimizer":    "Optimizer",
    "augmentation": "Augmentation",
    "hardware":     "Hardware",
    "thresholds":   "Thresholds & Regularization",
}


def get_all_schemas() -> Dict[str, dict]:
    return {k: {"trainer_type": k, "display_name": v["display_name"]} for k, v in _REGISTRY.items()}


def get_schema(trainer_type: str) -> dict:
    schema = _REGISTRY.get(trainer_type)
    if not schema:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"No schema for trainer_type '{trainer_type}'")
    return {**schema, "group_order": GROUP_ORDER, "group_labels": GROUP_LABELS}
