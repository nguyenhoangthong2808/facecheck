// File: mobile/src/config/api.js

// Bạn có thể thay đổi các subdomain này nếu muốn, nhưng hãy đảm bảo lệnh chạy tunnel cũng dùng cùng tên.
// Dán địa chỉ .trycloudflare.com bạn thấy ở terminal vào đây:
export const BACKEND_URL = `https://biohr-be-v100.loca.lt`; 
export const AI_SERVICE_URL = BACKEND_URL; // Không đổi

export const LT_HEADERS = { 
  'Bypass-Tunnel-Reminder': 'true' 
};

export const API_TIMEOUT = 30000; // 30 seconds
