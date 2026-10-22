import {defineConfig, devices} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e', fullyParallel:false, workers:1, timeout:60000, expect:{timeout:10000}, reporter:'list', use:{baseURL:'http://127.0.0.1:3100',trace:'retain-on-failure',launchOptions:process.env.LOW_MEMORY_TESTS==='true'?{args:['--disable-gpu','--renderer-process-limit=1']}:{}}, projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}], webServer:{command:'npm run dev',url:'http://127.0.0.1:3100/api/health',reuseExistingServer:true,timeout:120000}});

