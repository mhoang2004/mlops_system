import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string) {
  // PostgreSQL trả về ISO string không có timezone suffix → JS hiểu là local time.
  // Append 'Z' để buộc parse là UTC, trình duyệt tự convert sang giờ local (UTC+7).
  const utc = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  return new Date(utc).toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
