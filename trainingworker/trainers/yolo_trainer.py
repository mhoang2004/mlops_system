import os
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from base_trainer import BaseTrainer

# ---------------------------------------------------------
# 1. MÔ HÌNH VÀ DỮ LIỆU ĐƯỢC THIẾT KẾ ĐỂ NHẬN NHÃN ĐỘNG
# ---------------------------------------------------------

class SimpleYoloNet(nn.Module):
    def __init__(self, num_classes):
        super().__init__()
        # Backbone trích xuất đặc trưng ảnh (Giả lập)
        self.backbone = nn.Sequential(
            nn.Conv2d(3, 16, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2)
        )
        
        # Head của YOLO phụ thuộc vào số lượng classes
        # Ví dụ một cell xuất ra: (5 thuộc tính box [x,y,w,h,conf] + num_classes)
        self.head = nn.Conv2d(16, 3 * (5 + num_classes), kernel_size=1)

    def forward(self, x):
        features = self.backbone(x)
        return self.head(features)

class YoloDataset(Dataset):
    def __init__(self, data_path, classes):
        self.data_path = data_path
        # Nhận tập nhãn từ Config truyền xuống để chuẩn hoá dữ liệu
        self.classes = classes 
        
    def __len__(self):
        return 100 # Mock 100 sample

    def __getitem__(self, idx):
        # Ảnh tensor dummy (3 channels, 224x224)
        image = torch.randn(3, 224, 224) 
        
        # Target dummy. Trong thực tế, đây là bước đọc file text YOLO (.txt)
        # và dùng `self.classes` để map chữ sang số ID.
        target = torch.randn(3 * (5 + len(self.classes)), 112, 112)
        return image, target


# ---------------------------------------------------------
# 2. YOLO TRAINER KẾ THỪA TỪ BASE TRAINER
# ---------------------------------------------------------

class YoloTrainer(BaseTrainer):
    def __init__(self, config: dict):
        super().__init__(config) # Kế thừa init để lấy self.classes, self.num_classes
        self.learning_rate = config.get("lr", 1e-3)
        self.data_path = config.get("data_path", "./dataset")

    def build_model(self):
        """
        Khởi tạo Model YOLO và ép Tầng Đầu Ra (Head) bằng đúng num_classes.
        """
        print(f"   -> Đang khởi tạo YOLO Head với {self.num_classes} classes...")
        model = SimpleYoloNet(num_classes=self.num_classes)
        return model

    def setup_dataloaders(self):
        """
        Truyền danh sách nhãn vào Dataloader để xử lý file annotations.
        """
        train_dataset = YoloDataset(self.data_path, classes=self.classes)
        # Trong thực tế sẽ có val_dataset tương tự
        
        train_loader = DataLoader(train_dataset, batch_size=4, shuffle=True)
        val_loader = DataLoader(train_dataset, batch_size=4, shuffle=False)
        return train_loader, val_loader

    def configure_optimizers(self):
        return optim.Adam(self.model.parameters(), lr=self.learning_rate)

    def train_step(self, batch):
        """Logic huấn luyện cụ thể của PyTorch YOLO"""
        images, targets = batch
        images, targets = images.to(self.device), targets.to(self.device)

        self.optimizer.zero_grad()
        
        # Forward pass
        predictions = self.model(images)
        
        # Tính Loss. Trong thực tế đây là YoloLoss (Box loss, Obj loss, Class loss)
        loss = nn.MSELoss()(predictions, targets) 
        
        # Backward pass
        loss.backward()
        self.optimizer.step()
        
        return loss

    def save_weights(self):
        """Lưu file trọng số .pt của PyTorch"""
        weights_path = os.path.join(self.output_dir, "best_yolo.pt")
        torch.save(self.model.state_dict(), weights_path)
        print(f"💾 Đã lưu Trọng số PyTorch tại: {weights_path}")