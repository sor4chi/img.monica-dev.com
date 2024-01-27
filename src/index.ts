import { Hono } from "hono";
import type { Context } from "hono";
import { accepts } from "hono/accept";
import { optimizeImage } from "wasm-image-optimization";

const isValidUrl = (url: string) => {
	try {
		new URL(url);
		return true;
	} catch (err) {
		return false;
	}
};

interface OptimizeInfo {
	width?: number;
	quality?: number;
	originalFormat?: string;
	bytes?: number;
}

interface Env {
	Bindings: {
		DISCORD_WEBHOOK_URL: string;
	};
	Variables: {
		optimizeInfo: OptimizeInfo;
		phase: string;
	};
}

const app = new Hono<Env>();

const FOREVER_CACHE_CONTROL = "public, max-age=31536000, immutable";

app.get("*", async (c) => {
	c.set("phase", "parse accept header");
	const type = accepts(c, {
		header: "Accept",
		supports: ["image/webp", "*/*", "image/*"],
		default: "identity",
	});

	const isWebp = type === "image/webp";

	c.set("phase", "parse url from query");
	const url = new URL(c.req.url);

	const imageUrl = c.req.query("url");
	if (!imageUrl || !isValidUrl(imageUrl)) {
		return c.text("valid url is required", { status: 400 });
	}

	c.set("phase", "fetch image from cache");
	const cache = caches.default;
	url.searchParams.append("webp", isWebp.toString());
	const cacheKey = new Request(url.toString());
	const cachedResponse = await cache.match(cacheKey);
	if (cachedResponse) {
		return cachedResponse;
	}

	c.set("phase", "fetch image from origin");
	const width = c.req.query("w");
	const widthInt = width ? parseInt(width) : undefined;
	const quality = c.req.query("q");
	const qualityInt = quality ? parseInt(quality) : undefined;

	const imgRes = await fetch(imageUrl, {
		cf: { cacheKey: imageUrl },
	});
	if (!imgRes.ok) {
		return c.text("image not found", { status: 404 });
	}

	c.set("phase", "parse image");
	const srcImage = await imgRes.arrayBuffer();
	const contentType = imgRes.headers.get("content-type") || undefined;

	c.set("optimizeInfo", {
		width: widthInt,
		quality: qualityInt,
		originalFormat: contentType,
		bytes: srcImage.byteLength,
	});

	c.set("phase", "unsupported image proxy");
	if (contentType && ["image/svg+xml", "image/gif"].includes(contentType)) {
		const response = new Response(srcImage, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": FOREVER_CACHE_CONTROL,
			},
		});
		c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
		return response;
	}

	c.set("phase", "optimize image");
	const format = isWebp
		? "webp"
		: contentType === "image/jpeg"
		  ? "jpeg"
		  : "png";

	c.set("phase", "optimize image, after copy");

	const image = await optimizeImage({
		image: srcImage,
		width: widthInt,
		quality: qualityInt,
		format,
	});

	c.set("phase", "optimized image proxy");
	const response = new Response(image, {
		headers: {
			"Content-Type": `image/${format}`,
			date: new Date().toUTCString(),
			"Cache-Control": FOREVER_CACHE_CONTROL,
		},
	});
	c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
	return response;
});

const TZ = "Asia/Tokyo";

const ERROR_MESSAGE = (
	err: Error,
	url: string,
	phase: string,
	info?: OptimizeInfo,
) =>
	`
## Error on ${new Date().toLocaleString("ja-JP", { timeZone: TZ })}

**URL**: ${url}

**Phase**: ${phase}

\`\`\`
${err.stack}
${JSON.stringify(info, null, 2)}
\`\`\`
`.trim();

const reportToDiscord = async (c: Context, content: string) => {
	const webhookUrl = c.env.DISCORD_WEBHOOK_URL;
	if (!webhookUrl) return;
	const webhook = new URL(webhookUrl);
	const res = await fetch(webhook.toString(), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ content }),
	});
	if (!res.ok) {
		throw new Error("failed to report error");
	}
};

app.onError(async (err, c) => {
	await reportToDiscord(
		c,
		ERROR_MESSAGE(err, c.req.url, c.get("phase"), c.get("optimizeInfo")),
	);

	return c.text("internal server error", { status: 500 });
});

export default app;
