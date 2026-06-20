# Mamba-UNet Segmentation

**Key**: `mamba_unet` · **Architecture**: VMamba + UNet

Trainer phân đoạn ảnh (semantic segmentation) — dự đoán mask nhị phân cho từng pixel.
Phù hợp với bài toán khoanh vùng vật thể, phân đoạn tổn thương, đo lường diện tích.

Kiến trúc kết hợp **Visual State Space (VSS/Mamba)** với **skip connections kiểu UNet** — hiệu quả hơn
Transformer trên ảnh y tế nhờ độ phức tạp tuyến tính O(n) thay vì O(n²).

---

## Dataset format

Dataset dùng **COCO JSON** với polygon annotation:

```
dataset/
├── images/
│   ├── img001.jpg
│   └── img002.jpg
└── annotations.json    ← 1 file duy nhất, COCO format
```

Cấu trúc `annotations.json`:

```json
{
  "images": [
    { "id": 1, "file_name": "img001.jpg" },
    { "id": 2, "file_name": "img002.jpg" }
  ],
  "annotations": [
    {
      "image_id": 1,
      "category_id": 1,
      "segmentation": [[x1, y1, x2, y2, x3, y3, ...]]
    }
  ],
  "categories": [
    { "id": 1, "name": "object" }
  ]
}
```

`segmentation` là list polygon — mỗi polygon là danh sách tọa độ pixel gốc `[x1,y1,x2,y2,...]`
(tối thiểu 3 điểm = 6 số). Một ảnh có thể có nhiều polygon, tất cả sẽ được hợp nhất thành 1 mask.

> **Upload lên hệ thống**: Đặt `images/` vào phần **Files**, `annotations.json` vào phần **Annotations**.

---

## Tham số quan trọng

### Model
| Tham số | Mặc định | Mô tả |
|---------|----------|-------|
| `img_size` | `512` | Kích thước ảnh đầu vào (px, chia hết 32). Ảnh grayscale được resize về giá trị này |
| `embed_dim` | `96` | Chiều rộng feature map tại tầng đầu. Các tầng sau nhân đôi (96→192→384→768) |
| `drop_path_rate` | `0.2` | Stochastic depth — regularization cho deep network |

**Khi nào tăng `embed_dim`?** Dataset lớn, object có chi tiết nhỏ, GPU đủ VRAM.
Các giá trị khuyến nghị: `24` (debug nhanh), `48` (nhẹ), `96` (mặc định), `128` (nặng).

### Training
| Tham số | Mặc định | Mô tả |
|---------|----------|-------|
| `loss_version` | `improved` | Công thức loss (xem bên dưới) |
| `warmup_epochs` | `10` | Số epoch tăng dần LR từ 0 → `learning_rate` |
| `epochs` | — | Tổng số epoch training |
| `learning_rate` | — | Peak LR sau warmup. LR decay kiểu cosine về 1% peak |
| `batch_size` | — | Batch size. Giảm nếu OOM (512px × embed_dim=96 cần ~6GB VRAM) |

### Loss functions

| Version | Công thức | Dùng khi |
|---------|-----------|----------|
| `basic` | CE(0.5) + Dice(0.5) | Baseline, class cân bằng |
| `improved` | CE(0.2) + Dice(0.5) + Focal(0.3) | **Mặc định** — imbalanced dataset, object nhỏ |
| `advanced` | CE(0.15) + Dice(0.45) + Focal(0.25) + Tversky(0.15) | Rất imbalanced, recall quan trọng hơn precision |

**Dice loss** cân bằng foreground nặng hơn background (0.7 vs 0.3) để tập trung vào vùng object.
**Focal loss** tự động tăng trọng số cho pixel khó (alpha=0.25, gamma=2).

---

## Metrics

| Metric | Mô tả |
|--------|-------|
| `dice` | Dice coefficient = 2·TP/(2·TP+FP+FN). Metric chính, range [0,1] |
| `iou` | Intersection over Union = TP/(TP+FP+FN). Khắt khe hơn Dice |
| `precision` | TP/(TP+FP) — trong các pixel được predict là object, bao nhiêu % đúng |
| `recall` | TP/(TP+FN) — trong các pixel object thực, bao nhiêu % được detect |

---

## Tips

- **Ảnh màu**: Trainer chuyển ảnh về grayscale. Nếu màu sắc là yếu tố quan trọng, cần custom trainer.
- **Object nhỏ**: Tăng `img_size` (640, 768) + giảm `batch_size` — tradeoff VRAM vs độ chính xác.
- **Pretrained checkpoint**: Dùng checkpoint `.pt` từ lần train trước cùng kiến trúc — thường tốt hơn
  train từ đầu, đặc biệt khi dataset nhỏ (< 500 ảnh).
- **Ảnh không có annotation**: Ảnh không tìm thấy trong JSON sẽ có zero mask — model học background,
  không crash. Nên loại ảnh không có nhãn ra khỏi dataset train để tránh ảnh hưởng.
- **VRAM estimate** (img_size=512): embed_dim=48 ≈ 4GB, embed_dim=96 ≈ 8GB, embed_dim=128 ≈ 14GB.
