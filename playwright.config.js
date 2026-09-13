import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',use:{baseURL:'http://127.0.0.1:18764',headless:true},webServer:{command:'python3 -m http.server 18764 --bind 127.0.0.1',url:'http://127.0.0.1:18764',reuseExistingServer:false},reporter:'list'});
