import { Hono } from "hono";
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

const app = new Hono();

const FOREVER_CACHE_CONTROL = "public, max-age=31536000, immutable";

app.get("*", async (c) => {
	const type = accepts(c, {
		header: "Accept",
		supports: ["image/webp", "*/*", "image/*"],
		default: "identity",
	});

	const isWebp = type === "image/webp";

	const url = new URL(c.req.url);

	const imageUrl = c.req.query("url");
	if (!imageUrl || !isValidUrl(imageUrl)) {
		return c.text("valid url is required", { status: 400 });
	}

	const cache = caches.default;
	url.searchParams.append("webp", isWebp.toString());
	const cacheKey = new Request(url.toString());
	const cachedResponse = await cache.match(cacheKey);
	if (cachedResponse) {
		return cachedResponse;
	}

	const width = c.req.query("w");
	const quality = c.req.query("q");

	const [srcImage, contentType] = await fetch(imageUrl, {
		cf: { cacheKey: imageUrl },
	})
		.then(async (res) =>
			res.ok
				? ([await res.arrayBuffer(), res.headers.get("content-type")] as const)
				: [],
		)
		.catch(() => []);

	if (!srcImage) {
		return c.text("image not found", { status: 404 });
	}

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

	const format = isWebp
		? "webp"
		: contentType === "image/jpeg"
		  ? "jpeg"
		  : "png";
	const image = await optimizeImage({
		image: srcImage,
		width: width ? parseInt(width) : undefined,
		quality: quality ? parseInt(quality) : undefined,
		format,
	});
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

export default app;
