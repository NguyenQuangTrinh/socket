const io = require('socket.io')(3000, {
    cors: {
        origin: "*", // Hoặc thay thế bằng các domain cụ thể
        methods: ["GET", "POST"], // Phương thức HTTP được phép
        allowedHeaders: ["my-custom-header"], // Các headers đặc biệt
        credentials: true // Cho phép gửi cookie cùng với request
    }
});
const jwt = require('jsonwebtoken'); // Dùng thư viện jsonwebtoken

const SECRET_KEY = 'your_secret_ke'; // Secret dùng để ký JWT
const RESET_INTERVAL = 1 * 60 * 60 * 1000;

const rateLimitData = {};
setInterval(() => {
    rateLimitData = {}; // Xóa toàn bộ dữ liệu rate limit
    console.log('Rate limit data has been cleared.');
  }, RESET_INTERVAL);

// Khoảng thời gian giới hạn (5 phút = 300000 ms)
const RATE_LIMIT_TIME = 5 * 60 * 1000;
const MAX_ACTIONS = 2; // Giới hạn 2 lần cho mỗi lệnh

// Middleware rate limiting cho từng lệnh cụ thể
function rateLimitMiddleware(socket, command, next) {
    const userId = socket.userId; // Lấy userId từ socket sau khi xác thực JWT
    const currentTime = Date.now();

    // Kiểm tra và khởi tạo dữ liệu rate limit cho user nếu chưa có
    if (!rateLimitData[userId]) {
        rateLimitData[userId] = {};
    }

    // Kiểm tra và khởi tạo dữ liệu rate limit cho lệnh cụ thể nếu chưa có
    if (!rateLimitData[userId][command]) {
        rateLimitData[userId][command] = {
            count: 0,
            firstActionTime: currentTime
        };
    }

    const commandData = rateLimitData[userId][command];

    // Reset lại nếu đã qua thời gian giới hạn
    if (currentTime - commandData.firstActionTime > RATE_LIMIT_TIME) {
        commandData.count = 0;
        commandData.firstActionTime = currentTime;
    }

    // Kiểm tra số lần thực hiện lệnh
    if (commandData.count >= MAX_ACTIONS) {
        return next(new Error(`Bạn chỉ có thể thực hiện lệnh ${command} 2 lần mỗi 5 phút.`));
    }

    // Cập nhật số lần thực hiện lệnh
    commandData.count++;
    next(); // Cho phép tiếp tục thực thi lệnh
}

// Middleware kiểm tra token JWT
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error: No token provided.'));
    }

    // Verify token
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            socket.disconnect(true);
            return next(new Error('Authentication error: Invalid token.'));
        }
        // Lưu thông tin userId sau khi verify thành công
        socket.userId = decoded.data.userId;
        next();
    });
});

// Sử dụng socket.userId trong các event sau khi xác thực
io.on('connection', (socket) => {


    // Middleware áp dụng cho các lệnh cụ thể
    socket.use((packet, next) => {
        const [eventName] = packet;
        if (eventName === 'newpost' || eventName === 'uppost') {
            rateLimitMiddleware(socket, eventName, next);
        } else {
            next();
        }
    });

    console.log(socket)
    socket.on('newpost', (data) => {
        io.emit("newpost", data);
        console.log(`Command from userId: ${socket.userId}`, data);
        // Xử lý lệnh tại đây
    });
});
