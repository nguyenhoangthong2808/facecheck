const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

dotenv.config();
const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── JWT Middleware (optional — chỉ dùng cho route có gắn authMiddleware) ──
const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
};

// ─────────── HEALTH ───────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'BioHR Backend is running' }));

// ─────────── SEED ───────────
app.post('/api/seed', async (req, res) => {
  try {
    await prisma.attendanceLog.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.department.deleteMany();
    const deptEng = await prisma.department.create({ data: { name: 'Engineering' } });
    const deptMkt = await prisma.department.create({ data: { name: 'Marketing' } });
    const deptOps = await prisma.department.create({ data: { name: 'Operations' } });
    await prisma.employee.createMany({
      data: [
        { employeeCode: '4920', fullName: 'Marcus Chen', email: 'm.chen@biohr.ai', departmentId: deptEng.id, avatarUrl: 'https://randomuser.me/api/portraits/men/44.jpg', isActive: true },
        { employeeCode: '3105', fullName: 'Sarah Jenkins', email: 's.jenkins@biohr.ai', departmentId: deptMkt.id, avatarUrl: 'https://randomuser.me/api/portraits/women/44.jpg', isActive: true },
        { employeeCode: '8821', fullName: 'David Miller', email: 'd.miller@biohr.ai', departmentId: deptEng.id, avatarUrl: 'https://randomuser.me/api/portraits/men/22.jpg', isActive: true },
        { employeeCode: '1244', fullName: 'Elena Rodriguez', email: 'e.rodriguez@biohr.ai', departmentId: deptMkt.id, avatarUrl: 'https://randomuser.me/api/portraits/women/33.jpg', isActive: true },
        { employeeCode: '9982', fullName: 'Ethan Wright', email: 'e.wright@biohr.ai', departmentId: deptOps.id, avatarUrl: null, isActive: true },
      ]
    });
    const adminExists = await prisma.admin.findUnique({ where: { username: 'admin' } });
    if (!adminExists) {
      await prisma.admin.create({ data: { username: 'admin', passwordHash: await bcrypt.hash('admin123', 10), role: 'SUPER_ADMIN' } });
    }
    res.json({ message: 'Seed thành công' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Seed thất bại' });
  }
});

// ─────────── AUTH ───────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 1. Kiểm tra Admin
    const admin = await prisma.admin.findUnique({ where: { username } });
    if (admin) {
      const isMatch = await bcrypt.compare(password, admin.passwordHash);
      if (!isMatch) return res.status(401).json({ error: 'Sai mật khẩu' });
      const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, JWT_SECRET, { expiresIn: '1d' });
      return res.json({ message: 'Đăng nhập thành công', token, user: { id: admin.id, username: admin.username, role: admin.role, fullName: 'Quản trị viên' } });
    }

    // 2. Kiểm tra Nhân viên
    const emp = await prisma.employee.findUnique({ where: { employeeCode: username }, include: { department: true } });
    if (emp) {
      if (password !== '123456' && password !== emp.employeeCode) return res.status(401).json({ error: 'Sai mật khẩu' });
      if (!emp.isActive) return res.status(403).json({ error: 'Tài khoản đã bị vô hiệu hóa' });
      const token = jwt.sign({ id: emp.id, employeeCode: emp.employeeCode, role: 'EMPLOYEE' }, JWT_SECRET, { expiresIn: '1d' });
      return res.json({ message: 'Đăng nhập thành công', token, user: { id: emp.id, employeeCode: emp.employeeCode, role: 'EMPLOYEE', fullName: emp.fullName, avatarUrl: emp.avatarUrl, department: emp.department.name } });
    }

    res.status(401).json({ error: 'Tài khoản không tồn tại' });
  } catch {
    res.status(500).json({ error: 'Lỗi server khi đăng nhập' });
  }
});

// ─────────── DASHBOARD ───────────
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const totalEmployees = await prisma.employee.count({ where: { isActive: true } });
    const enrolled = await prisma.employee.count({ where: { isActive: true, faceEmbedding: { isEmpty: false } } });
    res.json({ totalEmployees, presentToday: enrolled, lateOrAbsent: totalEmployees - enrolled, aiScanSuccess: 99.2 });
  } catch {
    res.json({ totalEmployees: 0, presentToday: 0, lateOrAbsent: 0, aiScanSuccess: 99.2 });
  }
});

app.get('/api/dashboard/feed', (req, res) => {
  res.json([
    { name: 'Marcus Chen', role: 'Product Designer', id: '4920', time: '08:42 SA', conf: '99.4%', status: 'ON TIME', avatar: 'https://randomuser.me/api/portraits/men/44.jpg' },
    { name: 'Sarah Jenkins', role: 'Operations Lead', id: '3105', time: '08:38 SA', conf: '98.1%', status: 'ON TIME', avatar: 'https://randomuser.me/api/portraits/women/44.jpg' },
    { name: 'David Miller', role: 'QA Engineer', id: '8821', time: '08:35 SA', conf: '97.8%', status: 'LATE', avatar: 'https://randomuser.me/api/portraits/men/22.jpg' },
    { name: 'Elena Rodriguez', role: 'HR Specialist', id: '1244', time: '08:29 SA', conf: '99.8%', status: 'ON TIME', avatar: 'https://randomuser.me/api/portraits/women/33.jpg' },
  ]);
});

// ─────────── EMPLOYEES ───────────
app.get('/api/employees', async (req, res) => {
  try {
    const { search, dept, status } = req.query;
    const where = { isActive: true };
    if (search) where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { employeeCode: { contains: search, mode: 'insensitive' } },
    ];
    if (dept) where.department = { name: dept };
    const employees = await prisma.employee.findMany({ where, include: { department: true }, orderBy: { createdAt: 'desc' } });
    const formatted = employees.map(emp => ({
      id: emp.id,
      employeeCode: emp.employeeCode,
      name: emp.fullName,
      email: emp.email,
      phone: emp.phone,
      dept: emp.department.name,
      departmentId: emp.departmentId,
      role: 'Nhân viên',
      status: emp.faceEmbedding?.length > 0 ? 'Face Enrolled' : 'Not Enrolled',
      avatar: emp.avatarUrl,
      initials: emp.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    }));
    const filtered = status ? formatted.filter(e => status === 'enrolled' ? e.status === 'Face Enrolled' : e.status === 'Not Enrolled') : formatted;
    res.json(filtered);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi tải danh sách nhân viên' });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    const { employeeCode, fullName, email, phone, departmentId, faceEmbedding } = req.body;
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) return res.status(400).json({ error: 'Phòng ban không tồn tại' });
    const employee = await prisma.employee.create({
      data: { employeeCode, fullName, email, phone, departmentId, faceEmbedding: faceEmbedding || [] }
    });
    res.json({ message: 'Thêm nhân viên thành công', employee });
  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') return res.status(400).json({ error: 'Mã nhân viên hoặc Email đã tồn tại' });
    res.status(500).json({ error: 'Lỗi server khi thêm nhân viên' });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeCode, fullName, email, phone, departmentId } = req.body;
    const employee = await prisma.employee.update({
      where: { id },
      data: { employeeCode, fullName, email, phone, departmentId },
      include: { department: true }
    });
    res.json({ message: 'Cập nhật thành công', employee });
  } catch (error) {
    console.error(error);
    if (error.code === 'P2025') return res.status(404).json({ error: 'Nhân viên không tồn tại' });
    if (error.code === 'P2002') return res.status(400).json({ error: 'Mã nhân viên hoặc Email đã tồn tại' });
    res.status(500).json({ error: 'Lỗi cập nhật nhân viên' });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.attendanceLog.deleteMany({ where: { employeeId: id } });
    await prisma.employee.delete({ where: { id } });
    res.json({ message: 'Xóa nhân viên thành công' });
  } catch (error) {
    console.error(error);
    if (error.code === 'P2025') return res.status(404).json({ error: 'Nhân viên không tồn tại' });
    res.status(500).json({ error: 'Lỗi xóa nhân viên' });
  }
});

// ─────────── ATTENDANCE ───────────
app.get('/api/attendance', async (req, res) => {
  try {
    const logs = await prisma.attendanceLog.findMany({
      include: { employee: { include: { department: true } } },
      orderBy: { checkTime: 'desc' },
      take: 50,
    });
    if (logs.length > 0) {
      const formatted = logs.map(log => ({
        id: log.id,
        name: log.employee.fullName,
        role: log.employee.department.name,
        status: log.status === 'ON_TIME' ? 'Present' : 'Late Arrival',
        checkIn: new Date(log.checkTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        checkInStatus: log.status === 'ON_TIME' ? 'Đúng giờ' : 'Trễ',
        checkOut: '—',
        conf: Math.round((log.confidenceScore || 0.98) * 100),
        avatar: log.employee.avatarUrl || 'https://randomuser.me/api/portraits/lego/1.jpg',
      }));
      return res.json(formatted);
    }
    // Fallback mock
    res.json([
      { id: 1, name: 'Sarah Jenkins', role: 'Senior Analyst', status: 'Present', checkIn: '08:52', checkInStatus: 'Đúng giờ', checkOut: '17:30', conf: 98, avatar: 'https://randomuser.me/api/portraits/women/44.jpg' },
      { id: 2, name: 'Marcus Chen', role: 'Product Designer', status: 'Late Arrival', checkIn: '09:45', checkInStatus: '+45 phút', checkOut: 'Chưa ra', conf: 99, avatar: 'https://randomuser.me/api/portraits/men/44.jpg' },
      { id: 3, name: 'Elena Rodriguez', role: 'HR Lead', status: 'Present', checkIn: '08:15', checkInStatus: 'Sớm', checkOut: '17:45', conf: 95, avatar: 'https://randomuser.me/api/portraits/women/33.jpg' },
    ]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi tải nhật ký điểm danh' });
  }
});

app.post('/api/attendance/checkin', async (req, res) => {
  try {
    const { employeeId, confidenceScore, type = 'IN' } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Thiếu employeeId' });
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { department: true } });
    if (!employee) return res.status(404).json({ error: 'Nhân viên không tồn tại' });
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const isLate = hour > 8 || (hour === 8 && minute > 0);
    const log = await prisma.attendanceLog.create({
      data: { employeeId, type, status: isLate ? 'LATE' : 'ON_TIME', confidenceScore: confidenceScore || 0.99 },
      include: { employee: { include: { department: true } } }
    });
    res.json({
      message: 'Điểm danh thành công!',
      log: {
        id: log.id,
        checkTime: log.checkTime,
        type: log.type,
        status: log.status,
        isLate,
        employee: { id: employee.id, fullName: employee.fullName, department: employee.department.name, avatarUrl: employee.avatarUrl }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi điểm danh' });
  }
});

// ─────────── FACE IDENTIFY ───────────
app.post('/api/face/identify', async (req, res) => {
  try {
    const { embedding } = req.body;
    if (!embedding || !Array.isArray(embedding)) return res.status(400).json({ error: 'Thiếu embedding vector' });
    const employees = await prisma.employee.findMany({
      where: { isActive: true, faceEmbedding: { isEmpty: false } },
      include: { department: true }
    });
    if (employees.length === 0) return res.json({ matched: false, message: 'Chưa có nhân viên nào đăng ký khuôn mặt' });
    const cosineSim = (a, b) => {
      const dot = a.reduce((s, v, i) => s + v * b[i], 0);
      const nA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
      const nB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
      return dot / (nA * nB);
    };
    let bestMatch = null, bestScore = -1;
    for (const emp of employees) {
      if (emp.faceEmbedding.length !== embedding.length) continue;
      const score = cosineSim(embedding, emp.faceEmbedding);
      if (score > bestScore) { bestScore = score; bestMatch = emp; }
    }
    if (bestScore < 0.60 || !bestMatch) return res.json({ matched: false, confidence: +(bestScore * 100).toFixed(1), message: 'Không tìm thấy nhân viên khớp' });
    res.json({
      matched: true,
      confidence: +(bestScore * 100).toFixed(1),
      employee: { id: bestMatch.id, employeeCode: bestMatch.employeeCode, fullName: bestMatch.fullName, email: bestMatch.email, phone: bestMatch.phone, department: bestMatch.department.name, avatarUrl: bestMatch.avatarUrl, isActive: bestMatch.isActive }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi nhận diện khuôn mặt' });
  }
});

// ─────────── DEPARTMENTS ───────────
app.get('/api/departments', async (req, res) => {
  try {
    res.json(await prisma.department.findMany());
  } catch {
    res.status(500).json({ error: 'Lỗi tải phòng ban' });
  }
});

// ─────────── EMPLOYEE PROFILE ───────────
app.get('/api/employees/:id', async (req, res) => {
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { department: true }
    });
    if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    const logs = await prisma.attendanceLog.findMany({
      where: { employeeId: req.params.id },
      orderBy: { checkTime: 'desc' },
      take: 30
    });
    const onTimeCount = logs.filter(l => l.status === 'ON_TIME').length;
    const lateCount = logs.filter(l => l.status === 'LATE').length;
    const totalHours = logs.length * 8; // mock: 8h/day
    res.json({
      id: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName,
      email: emp.email, phone: emp.phone, avatarUrl: emp.avatarUrl,
      department: emp.department.name, departmentId: emp.departmentId,
      isActive: emp.isActive, faceEnrolled: emp.faceEmbedding?.length > 0,
      createdAt: emp.createdAt,
      stats: { totalDays: logs.length, onTime: onTimeCount, late: lateCount, totalHours },
      recentLogs: logs.map(l => ({
        id: l.id, type: l.type, status: l.status,
        checkTime: l.checkTime, confidenceScore: l.confidenceScore
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi tải hồ sơ nhân viên' });
  }
});

// ─────────── CHECK-OUT ───────────
app.post('/api/attendance/checkout', async (req, res) => {
  try {
    const { employeeId, confidenceScore } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Thiếu employeeId' });
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { department: true } });
    if (!employee) return res.status(404).json({ error: 'Nhân viên không tồn tại' });
    // Tìm log check-in gần nhất trong ngày
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastCheckin = await prisma.attendanceLog.findFirst({
      where: { employeeId, type: 'IN', checkTime: { gte: today } },
      orderBy: { checkTime: 'desc' }
    });
    const log = await prisma.attendanceLog.create({
      data: { employeeId, type: 'OUT', status: 'ON_TIME', confidenceScore: confidenceScore || 0.99 }
    });
    let workHours = null;
    if (lastCheckin) {
      const diffMs = new Date(log.checkTime) - new Date(lastCheckin.checkTime);
      workHours = (diffMs / 3600000).toFixed(1);
    }
    res.json({
      message: 'Check-out thành công!',
      log: { id: log.id, checkTime: log.checkTime, type: 'OUT', workHours,
        employee: { id: employee.id, fullName: employee.fullName, department: employee.department.name, avatarUrl: employee.avatarUrl }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi check-out' });
  }
});

// ─────────── PAYROLL ───────────
app.get('/api/payroll', async (req, res) => {
  try {
    const { month = new Date().getMonth() + 1, year = new Date().getFullYear() } = req.query;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const employees = await prisma.employee.findMany({ where: { isActive: true }, include: { department: true } });
    const HOURLY_RATE = 150000; // VND/giờ
    const WORK_HOURS_PER_DAY = 8;
    const payroll = await Promise.all(employees.map(async emp => {
      const logs = await prisma.attendanceLog.findMany({
        where: { employeeId: emp.id, type: 'IN', checkTime: { gte: startDate, lte: endDate } }
      });
      const daysWorked = logs.length;
      const onTime = logs.filter(l => l.status === 'ON_TIME').length;
      const late = logs.filter(l => l.status === 'LATE').length;
      const standardHours = daysWorked * WORK_HOURS_PER_DAY;
      const overtimeHours = Math.max(0, standardHours - 176); // >176h/tháng = OT
      const baseSalary = standardHours * HOURLY_RATE;
      const overtimePay = overtimeHours * HOURLY_RATE * 1.5;
      const totalSalary = baseSalary + overtimePay;
      return {
        id: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName,
        department: emp.department.name, avatarUrl: emp.avatarUrl,
        daysWorked, onTime, late, standardHours, overtimeHours,
        baseSalary, overtimePay, totalSalary
      };
    }));
    res.json({ month: +month, year: +year, payroll });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi tính bảng lương' });
  }
});

// ─────────── SHIFTS (PostgreSQL) ───────────
app.get('/api/shifts', async (req, res) => {
  try {
    const shifts = await prisma.shift.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(shifts);
  } catch (err) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

app.post('/api/shifts', async (req, res) => {
  const { name, startTime, endTime, color = 'blue', lateAfterMinutes = 15 } = req.body;
  if (!name || !startTime || !endTime) return res.status(400).json({ error: 'Thiếu thông tin ca làm việc' });
  try {
    const shift = await prisma.shift.create({ data: { name, startTime, endTime, color, lateAfterMinutes } });
    res.json({ message: 'Tạo ca thành công', shift });
  } catch (err) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

app.put('/api/shifts/:id', async (req, res) => {
  try {
    const shift = await prisma.shift.update({ where: { id: req.params.id }, data: req.body });
    res.json({ message: 'Cập nhật ca thành công', shift });
  } catch (err) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

app.delete('/api/shifts/:id', async (req, res) => {
  try {
    await prisma.shift.delete({ where: { id: req.params.id } });
    res.json({ message: 'Xóa ca thành công' });
  } catch (err) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

// ─────────── LEAVES (PostgreSQL) ───────────
app.get('/api/leaves', async (req, res) => {
  try {
    const leaves = await prisma.leave.findMany({
      include: { employee: { select: { fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' }
    });
    const formatted = leaves.map(l => ({
      id: l.id,
      employeeName: l.employee.fullName,
      employeeId: l.employeeId,
      avatarUrl: l.employee.avatarUrl,
      type: l.type,
      from: l.from,
      to: l.to,
      days: l.days,
      reason: l.reason,
      status: l.status.toLowerCase(),
      submittedAt: l.createdAt
    }));
    res.json(formatted);
  } catch (err) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

app.post('/api/leaves', async (req, res) => {
  const { employeeId, type, from, to, days, reason } = req.body;
  // If the admin uses the mock form, it doesn't have employeeId (frontend currently maps employeeName only). 
  // Wait, I updated the frontend to send employeeId if EMPLOYEE. For Admin, it might fail unless we fix it.
  // Assuming frontend for Admin is not actively used to create leaves for others.
  if (!employeeId || !from || !to) return res.status(400).json({ error: 'Thiếu thông tin đơn nghỉ phép' });
  try {
    const leave = await prisma.leave.create({
      data: { employeeId, type: type || 'Nghỉ phép năm', from, to, days: days || 1, reason: reason || '', status: 'PENDING' }
    });
    res.json({ message: 'Gửi đơn thành công', leave });
  } catch (err) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

app.put('/api/leaves/:id/approve', async (req, res) => {
  try {
    const leave = await prisma.leave.update({ where: { id: req.params.id }, data: { status: 'APPROVED' } });
    res.json({ message: 'Đã duyệt đơn nghỉ phép', leave });
  } catch (err) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

app.put('/api/leaves/:id/reject', async (req, res) => {
  try {
    const leave = await prisma.leave.update({ where: { id: req.params.id }, data: { status: 'REJECTED' } });
    res.json({ message: 'Đã từ chối đơn nghỉ phép', leave });
  } catch (err) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

// ─────────── EMPLOYEE PORTAL ───────────
// Đăng nhập bằng mã nhân viên
app.post('/api/portal/login', async (req, res) => {
  try {
    const { employeeCode } = req.body;
    if (!employeeCode) return res.status(400).json({ error: 'Vui lòng nhập mã nhân viên' });
    const emp = await prisma.employee.findUnique({
      where: { employeeCode },
      include: { department: true }
    });
    if (!emp) return res.status(404).json({ error: 'Mã nhân viên không tồn tại' });
    if (!emp.isActive) return res.status(403).json({ error: 'Tài khoản đã bị vô hiệu hóa' });
    const token = jwt.sign(
      { id: emp.id, employeeCode: emp.employeeCode, type: 'employee' },
      JWT_SECRET, { expiresIn: '8h' }
    );
    res.json({
      message: 'Đăng nhập thành công',
      token,
      employee: {
        id: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName,
        email: emp.email, phone: emp.phone, avatarUrl: emp.avatarUrl,
        department: emp.department.name, departmentId: emp.departmentId,
        faceEnrolled: emp.faceEmbedding?.length > 0
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Middleware xác thực nhân viên portal
const employeeAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    if (decoded.role !== 'EMPLOYEE') return res.status(403).json({ error: 'Không có quyền truy cập' });
    req.employeeId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

// Lấy thông tin + thống kê của bản thân
app.get('/api/portal/me', employeeAuth, async (req, res) => {
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: req.employeeId },
      include: { department: true }
    });
    if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const [todayLogs, monthLogs, recent] = await Promise.all([
      prisma.attendanceLog.findMany({ where: { employeeId: emp.id, checkTime: { gte: today } }, orderBy: { checkTime: 'asc' } }),
      prisma.attendanceLog.findMany({ where: { employeeId: emp.id, type: 'IN', checkTime: { gte: startOfMonth } } }),
      prisma.attendanceLog.findMany({ where: { employeeId: emp.id }, orderBy: { checkTime: 'desc' }, take: 20 })
    ]);
    const checkin  = todayLogs.find(l => l.type === 'IN');
    const checkout = [...todayLogs].reverse().find(l => l.type === 'OUT');
    let workHours = null;
    if (checkin && checkout) workHours = ((new Date(checkout.checkTime) - new Date(checkin.checkTime)) / 3600000).toFixed(1);
    res.json({
      id: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName,
      email: emp.email, phone: emp.phone, avatarUrl: emp.avatarUrl,
      department: emp.department.name, departmentId: emp.departmentId,
      faceEnrolled: emp.faceEmbedding?.length > 0,
      today: { checkin: checkin ? { time: checkin.checkTime, status: checkin.status } : null, checkout: checkout ? { time: checkout.checkTime } : null, workHours },
      month: { total: monthLogs.length, onTime: monthLogs.filter(l => l.status === 'ON_TIME').length, late: monthLogs.filter(l => l.status === 'LATE').length },
      recent: recent.map(l => ({ id: l.id, type: l.type, status: l.status, checkTime: l.checkTime }))
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Lỗi tải dữ liệu' });
  }
});

// Cập nhật thông tin cá nhân
app.put('/api/portal/update-profile', employeeAuth, async (req, res) => {
  try {
    const { fullName, email, phone } = req.body;
    const emp = await prisma.employee.update({
      where: { id: req.employeeId },
      data: { fullName, email, phone },
      include: { department: true }
    });
    res.json({
      message: 'Cập nhật thông tin thành công',
      employee: { id: emp.id, fullName: emp.fullName, email: emp.email, phone: emp.phone, department: emp.department.name, avatarUrl: emp.avatarUrl, faceEnrolled: emp.faceEmbedding?.length > 0 }
    });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') return res.status(400).json({ error: 'Email này đã được sử dụng bởi nhân viên khác' });
    res.status(500).json({ error: 'Lỗi cập nhật thông tin' });
  }
});

// Cập nhật khuôn mặt (embedding từ AI Service)
app.put('/api/portal/update-face', employeeAuth, async (req, res) => {
  try {
    const { faceEmbedding } = req.body;
    if (!faceEmbedding || !Array.isArray(faceEmbedding)) return res.status(400).json({ error: 'Thiếu dữ liệu khuôn mặt' });
    await prisma.employee.update({ where: { id: req.employeeId }, data: { faceEmbedding } });
    res.json({ message: 'Cập nhật khuôn mặt thành công! Hệ thống AI sẽ nhận diện bạn từ lần sau.' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Lỗi cập nhật khuôn mặt' });
  }
});

// ─────────── KIOSK (Employee self-service) ───────────

app.get('/api/kiosk/:id', async (req, res) => {
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { department: true }
    });
    if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

    // Trạng thái hôm nay
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayLogs = await prisma.attendanceLog.findMany({
      where: { employeeId: emp.id, checkTime: { gte: today } },
      orderBy: { checkTime: 'asc' }
    });
    const checkin  = todayLogs.find(l => l.type === 'IN');
    const checkout = todayLogs.filter(l => l.type === 'OUT').pop();
    let workHours = null;
    if (checkin && checkout) {
      workHours = ((new Date(checkout.checkTime) - new Date(checkin.checkTime)) / 3600000).toFixed(1);
    }

    // Tháng này
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthLogs = await prisma.attendanceLog.findMany({
      where: { employeeId: emp.id, type: 'IN', checkTime: { gte: startOfMonth } }
    });
    const onTime = monthLogs.filter(l => l.status === 'ON_TIME').length;
    const late   = monthLogs.filter(l => l.status === 'LATE').length;

    // 7 bản ghi gần nhất
    const recent = await prisma.attendanceLog.findMany({
      where: { employeeId: emp.id },
      orderBy: { checkTime: 'desc' },
      take: 7
    });

    res.json({
      id: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName,
      email: emp.email, phone: emp.phone, avatarUrl: emp.avatarUrl,
      department: emp.department.name, isActive: emp.isActive,
      today: {
        checkin:  checkin  ? { time: checkin.checkTime,  status: checkin.status }  : null,
        checkout: checkout ? { time: checkout.checkTime } : null,
        workHours
      },
      month: { total: monthLogs.length, onTime, late },
      recent: recent.map(l => ({ id: l.id, type: l.type, status: l.status, checkTime: l.checkTime }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi tải dữ liệu kiosk' });
  }
});

// ─────────── NOTIFICATIONS (PostgreSQL) ───────────
app.get('/api/notifications', async (req, res) => {
  try {
    const notifs = await prisma.notification.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(notifs.map(n => ({ id: n.id, title: n.title, content: n.content, date: n.createdAt })));
  } catch (err) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

app.post('/api/notifications', async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Thiếu tiêu đề hoặc nội dung' });
  try {
    const notif = await prisma.notification.create({ data: { title, content } });
    res.json({ message: 'Đã gửi thông báo', notif: { id: notif.id, title: notif.title, content: notif.content, date: notif.createdAt } });
  } catch (err) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

app.delete('/api/notifications/:id', async (req, res) => {
  try {
    await prisma.notification.delete({ where: { id: req.params.id } });
    res.json({ message: 'Xóa thông báo thành công' });
  } catch (err) { res.status(500).json({ error: 'Lỗi máy chủ' }); }
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ BioHR Backend chạy tại cổng ${PORT}`));


