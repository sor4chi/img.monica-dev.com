import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { UnstableDevWorker, unstable_dev } from "wrangler";

const images = ["test01.png", "test02.jpg", "test03.avif", "test04.gif"];
const imageUrl = (image: string) =>
	`https://raw.githubusercontent.com/sor4chi/img.monica-dev.com/main/assets/${image}`;

describe("Wrangler", () => {
	let worker: UnstableDevWorker;
	let time: number;

	beforeAll(async () => {
		worker = await unstable_dev("./src/index.ts", {
			experimental: { disableExperimentalWarning: true },
			ip: "127.0.0.1",
		});
		time = Date.now();
	});

	afterAll(async () => {
		if (worker) await worker.stop();
		time = 0;
	});

	test("GET /", async () => {
		const res = await worker.fetch("/");
		expect(res.status).toBe(400);
		expect(await res.text()).toBe("valid url is required");
	});

	test("not found", async () => {
		for (let i = 0; i < images.length; i++) {
			const url = imageUrl(`_${images[i]}`);
			const res = await worker.fetch(`/?url=${encodeURI(url)}&t=${time}`, {
				headers: { accept: "image/webp,image/jpeg,image/png" },
			});
			expect(res.status).toBe(404);
		}
	});

	test("webp", async () => {
		const types = ["webp", "webp", "webp", "gif"];
		for (let i = 0; i < images.length; i++) {
			const url = imageUrl(images[i]);
			const res = await worker.fetch(`/?url=${encodeURI(url)}&t=${time}`, {
				headers: { accept: "image/webp,image/jpeg,image/png" },
			});
			expect(res.status).toBe(200);
			expect(Object.fromEntries(res.headers.entries())).toMatchObject({
				"content-type": `image/${types[i]}`,
			});
			expect(res.headers.get("cf-cache-status")).toBeNull();
		}
	});

	test("webp(cache)", async () => {
		const types = ["webp", "webp", "webp", "gif"];
		for (let i = 0; i < images.length; i++) {
			const url = imageUrl(images[i]);
			const res = await worker.fetch(`/?url=${encodeURI(url)}&t=${time}`, {
				headers: { accept: "image/webp,image/jpeg,image/png" },
			});
			expect(res.status).toBe(200);
			expect(Object.fromEntries(res.headers.entries())).toMatchObject({
				"content-type": `image/${types[i]}`,
				"cf-cache-status": "HIT",
			});
		}
	});

	test("not webp", async () => {
		const types = ["png", "jpeg", "png", "gif"];
		for (let i = 0; i < images.length; i++) {
			const url = imageUrl(images[i]);
			const res = await worker.fetch(`/?url=${encodeURI(url)}&t=${time}`, {
				headers: { accept: "image/jpeg,image/png" },
			});
			expect(res.status).toBe(200);
			expect(Object.fromEntries(res.headers.entries())).toMatchObject({
				"content-type": `image/${types[i]}`,
			});
			expect(res.headers.get("cf-cache-status")).toBeNull();
		}
	});

	test("not webp(cache)", async () => {
		const types = ["png", "jpeg", "png", "gif"];
		for (let i = 0; i < images.length; i++) {
			const url = imageUrl(images[i]);
			const res = await worker.fetch(`/?url=${encodeURI(url)}&t=${time}`, {
				headers: { accept: "image/jpeg,image/png" },
			});
			expect(res.status).toBe(200);
			expect(Object.fromEntries(res.headers.entries())).toMatchObject({
				"content-type": `image/${types[i]}`,
				"cf-cache-status": "HIT",
			});
		}
	});
});
