import os
import json
import torch
from abc import ABC, abstractmethod

class BaseTrainer(ABC):
    def __init__(self, config: dict):
        """
        Khởi tạo Base Trainer nhận cấu hình từ hệ thống MLOps.
        """
        self.config = config
        
        # --- QUẢN LÝ NHÃN (ĐỘNG) ---
        self.classes = config.get("classes", [])
        self.num_classes = len(self.classes)
        
        if self.num_classes == 0:
            raise ValueError("Danh sách nhãn (classes) không được để trống!")
            
        # --- CẤU HÌNH HỆ THỐNG ---
        self.epochs = config.get("epochs", 10)
        self.output_dir = config.get("output_dir", "./runs/train")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Tạo thư mục lưu kết quả
        os.makedirs(self.output_dir, exist_ok=True)
        
    def train(self):
        """
        Luồng huấn luyện chuẩn của hệ thống.
        """
        print(f"🚀 Bắt đầu Training trên thiết bị: {self.device}")
        print(f"📦 Số nhãn (Classes): {self.num_classes} -> {self.classes}")
        
        # 1. Khởi tạo thành phần (Do lớp con định nghĩa)
        self.train_loader, self.val_loader = self.setup_dataloaders()
        self.model = self.build_model().to(self.device)
        self.optimizer = self.configure_optimizers()
        
        # 2. Vòng lặp huấn luyện (Training Loop)
        for epoch in range(self.epochs):
            self.model.train()
            total_loss = 0
            
            for batch_idx, batch in enumerate(self.train_loader):
                loss = self.train_step(batch)
                total_loss += loss.item()
                
            avg_loss = total_loss / len(self.train_loader)
            print(f"Epoch [{epoch+1}/{self.epochs}] - Loss: {avg_loss:.4f}")
            
            # Validation (nếu có)
            self.val_epoch()
            
        # 3. Đóng gói Artifact sau khi hoàn tất
        self.save_model_artifact()
        print("✅ Huấn luyện hoàn tất!")

    def val_epoch(self):
        """Đánh giá mô hình sau mỗi epoch."""
        self.model.eval()
        with torch.no_grad():
            pass # Logic validation sẽ tuỳ biến ở lớp con nếu cần

    def save_model_artifact(self):
        """
        CHÌA KHÓA: Đóng gói Metadata (Nhãn) đi kèm với Trọng số.
        """
        # 1. Lưu file json chứa tập nhãn của Project hiện tại
        metadata = {
            "model_type": self.__class__.__name__,
            "num_classes": self.num_classes,
            "classes": self.classes,
            "epochs_trained": self.epochs
        }
        meta_path = os.path.join(self.output_dir, "model_meta.json")
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=4, ensure_ascii=False)
            
        # 2. Lưu file trọng số (weights) của PyTorch
        self.save_weights()
        print(f"💾 Đã lưu Metadata nhãn tại: {meta_path}")

    # --- CÁC HÀM BẮT BUỘC LỚP CON PHẢI CÀI ĐẶT ---
    @abstractmethod
    def setup_dataloaders(self): pass
    
    @abstractmethod
    def build_model(self): pass
    
    @abstractmethod
    def configure_optimizers(self): pass
    
    @abstractmethod
    def train_step(self, batch): pass
    
    @abstractmethod
    def save_weights(self): pass