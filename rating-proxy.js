const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
const printLogo = require("./src/logo");

class Rating {
    constructor() {
        this.headers = {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "en-US,en;q=0.9",
            "Content-Type": "text/plain",
            "Origin": "https://static.ratingtma.com",
            "Referer": "https://static.ratingtma.com/",
            "Sec-Ch-Ua": '"Microsoft Edge";v="129", "Not=A?Brand";v="8", "Chromium";v="129", "Microsoft Edge WebView2";v="129"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0"
        };
        this.proxies = fs.readFileSync('proxy.txt', 'utf8').split('\n').filter(Boolean);
        this.currentProxy = '';
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch (type) {
            case 'success':
                console.log(`[${timestamp}] [*] ${message}`.green);
                break;
            case 'custom':
                console.log(`[${timestamp}] [*] ${message}`.magenta);
                break;
            case 'error':
                console.log(`[${timestamp}] [!] ${message}`.red);
                break;
            case 'warning':
                console.log(`[${timestamp}] [*] ${message}`.yellow);
                break;
            default:
                console.log(`[${timestamp}] [*] ${message}`.blue);
        }
    }

    async countdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`===== Đang chờ ${i} giây để tiếp tục vòng lặp =====`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        this.log('', 'info');
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', { httpsAgent: proxyAgent });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Không thể kiểm tra IP proxy. Mã trạng thái: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Lỗi khi kiểm tra IP proxy: ${error.message}`);
        }
    }

    async makeRequest(method, url, data = {}, token = null) {
        const headers = { ...this.headers };
        if (token) {
            headers['Authorization'] = token;
            headers['Content-Hello'] = Math.random().toString();
            headers['Content-Id'] = Math.random().toString();
        }

        const config = {
            method,
            url,
            headers,
            httpsAgent: new HttpsProxyAgent(this.currentProxy),
        };

        if (method.toLowerCase() === 'post') {
            config.data = data;
        }

        try {
            const response = await axios(config);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async authenticate(auth) {
        const url = `https://api.ratingtma.com/auth/auth.tma?${auth}`;
        const response = await this.makeRequest('post', url);
        if (response.success && response.data.response && response.data.response.token) {
            return { success: true, token: response.data.response.token };
        } else {
            return { success: false, error: response.error || 'Định dạng phản hồi không hợp lệ' };
        }
    }

    async getUserInfo(token) {
        const url = "https://api.ratingtma.com/game/user.get";
        const response = await this.makeRequest('get', url, {}, token);
        if (response.success && response.data.response) {
            return { success: true, data: response.data.response };
        } else {
            return { success: false, error: response.error || 'Định dạng phản hồi không hợp lệ' };
        }
    }

    async spinRoulette(token) {
        const url = "https://api.ratingtma.com/game/minigame.roulette";
        const response = await this.makeRequest('post', url, {}, token);
        if (response.success && response.data.response) {
            return { success: true, data: response.data.response };
        } else {
            return { success: false, error: response.error || 'Định dạng phản hồi không hợp lệ' };
        }
    }

    async getTaskListByGroup(token, group, lang = 'vi') {
        const url = "https://api.ratingtma.com/task/task.list";
        const payload = { "group": group, "lang": lang };
        const response = await this.makeRequest('post', url, payload, token);
        if (response.success && response.data.response) {
            return { success: true, data: response.data.response };
        } else {
            return { success: false, error: response.error || 'Định dạng phản hồi không hợp lệ' };
        }
    }

    async executeTaskByOrder(token, group, order) {
        const url = "https://api.ratingtma.com/task/task.execute";
        const payload = { "group": group, "order": order };
        const response = await this.makeRequest('post', url, payload, token);
        if (response.success && response.data.response) {
            return { success: true, data: response.data.response };
        } else {
            return { success: false, error: response.error || 'Định dạng phản hồi không hợp lệ' };
        }
    }

    async processAllTaskLists(token) {
        const groups = ['daily', 'partners', 'monthly', 'main'];
        const lang = 'vi';

        for (const group of groups) {
            try {
                const response = await this.getTaskListByGroup(token, group, lang);
                if (response.success) {
                    const tasks = response.data[group]?.tasks.flat() || [];
                    const openTasks = tasks.filter(task => task.status === 'OPEN');

                    this.log(`Nhiệm vụ mở cho ${group}:`, 'info');
                    openTasks.forEach(task => this.log(`- ${task.title} (ID: ${task.id})`, 'custom'));

                    for (const task of openTasks) {
                        if (task.action === 'link') {
                            await this.processLinkTask(token, task, group);
                        }
                    }
                } else {
                    this.log(`Không thể lấy nhiệm vụ cho ${group}: ${response.error}`, 'error');
                }
            } catch (error) {
                this.log(`Lỗi khi xử lý nhiệm vụ ${group}: ${error.message}`, 'error');
            }
        }
    }

    async processLinkTask(token, task, group) {
        try {
            await this.makeRequest('post', 'https://api.ratingtma.com/task/task.link',
                { group, task: task.id, action: 'link' }, token);

            await this.makeRequest('post', 'https://api.ratingtma.com/task/task.data',
                { task: task.id }, token);

            const response = await this.getTaskListByGroup(token, group);

            if (response.success) {
                const updatedTask = response.data[group].tasks.flat().find(t => t.id === task.id);

                if (updatedTask && updatedTask.order) {
                    const executeResult = await this.executeTaskByOrder(token, group, updatedTask.order);

                    if (executeResult.success && executeResult.data.result) {
                        const reward = task.item[0]?.count || 'không xác định';
                        this.log(`Nhiệm vụ ${task.title} đã hoàn thành | phần thưởng ${reward}`, 'success');
                    } else {
                        this.log(`Không thể hoàn thành nhiệm vụ ${task.title}`, 'error');
                    }
                }
            }
        } catch (error) {
            this.log(`Lỗi khi xử lý nhiệm vụ ${task.id}: ${error.message}`, 'error');
        }
    }

    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        const tokenFile = path.join(__dirname, 'token.json');
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        let tokens = {};
        if (fs.existsSync(tokenFile)) {
            tokens = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
        }

        while (true) {
            printLogo();
            for (let i = 0; i < data.length; i++) {
                const auth = data[i];
                const userId = JSON.parse(decodeURIComponent(auth.split('user=')[1].split('&')[0])).id;
                this.currentProxy = this.proxies[i % this.proxies.length];

                let proxyIP = 'Không xác định';
                try {
                    proxyIP = await this.checkProxyIP(this.currentProxy);
                } catch (error) {
                    this.log(`Không thể kiểm tra IP proxy: ${error.message}`, 'warning');
                }

                console.log(`🔹 ========== Tài khoản ${i + 1} | ID: ${userId} | IP: ${proxyIP} ==========`);

                this.log(`Đang xác thực tài khoản ${userId}...`, 'info');
                let token = tokens[userId];
                if (!token) {
                    const authResult = await this.authenticate(auth);
                    if (authResult.success) {
                        token = authResult.token;
                        tokens[userId] = token;
                        fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));
                        this.log('Xác thực thành công!', 'success');
                    } else {
                        this.log(`Xác thực thất bại! ${authResult.error}`, 'error');
                        continue;
                    }
                } else {
                    this.log('Đang sử dụng token đã lưu.', 'info');
                }

                const taskListResult = await this.getTaskListByGroup(token, 'calendar');
                if (taskListResult.success) {
                    const readyTask = taskListResult.data.calendar.tasks[0].find(task => task.status === 'READ');
                    if (readyTask) {
                        this.log(`Đã tìm thấy nhiệm vụ Lịch Thưởng Hàng Ngày sẵn sàng. Thứ tự: ${readyTask.order}`, 'info');
                        const executeResult = await this.executeTaskByOrder(token, 'calendar', readyTask.order);
                        if (executeResult.success && executeResult.data.result) {
                            this.log('Lịch Thưởng Hàng Ngày đã hoàn thành', 'success');
                        } else {
                            this.log('Không thể hoàn thành Lịch Thưởng Hàng Ngày', 'error');
                        }
                    } else {
                        this.log('Không có nhiệm vụ Lịch Thưởng Hàng Ngày nào sẵn sàng', 'warning');
                    }
                } else {
                    this.log(`Không thể lấy danh sách nhiệm vụ: ${taskListResult.error}`, 'error');
                }

                let userInfoResult = await this.getUserInfo(token);
                if (userInfoResult.success) {
                    let energy = userInfoResult.data.balances.find(b => b.key === 'energy').count;
                    let ticket = userInfoResult.data.balances.find(b => b.key === 'ticket').count;
                    this.log(`Năng lượng: ${energy}, Vé: ${ticket}`, 'custom');

                    while (ticket > 0) {
                        const spinResult = await this.spinRoulette(token);
                        if (spinResult.success) {
                            this.log(`Quay thành công, nhận được ${spinResult.data.score} điểm`, 'success');
                            ticket--;
                        } else {
                            this.log(`Quay thất bại: ${spinResult.error}`, 'error');
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    userInfoResult = await this.getUserInfo(token);
                    if (userInfoResult.success) {
                        energy = userInfoResult.data.balances.find(b => b.key === 'energy').count;
                        ticket = userInfoResult.data.balances.find(b => b.key === 'ticket').count;
                        this.log(`Sau khi quay - Năng lượng: ${energy}, Vé: ${ticket}`, 'custom');
                    }

                    await this.processAllTaskLists(token);
                } else {
                    this.log(`Không thể lấy thông tin người dùng: ${userInfoResult.error}`, 'error');
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            await this.countdown(86400); // Đếm ngược 24 giờ
        }
    }
}

const client = new Rating();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});
