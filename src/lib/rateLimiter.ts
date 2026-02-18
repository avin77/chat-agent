// Rate limiter for Gemini API (30 requests per minute for Gemma 3 27B free tier)
class GeminiRateLimiter {
    private requests: number[] = [];
    private readonly maxRequests = 30;
    private readonly windowMs = 60 * 1000; // 1 minute

    canMakeRequest(): { allowed: boolean; waitMs: number; requestCount: number } {
        const now = Date.now();

        // Remove requests older than 1 minute
        this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);

        if (this.requests.length < this.maxRequests) {
            return { allowed: true, waitMs: 0, requestCount: this.requests.length };
        }

        // Calculate wait time until oldest request expires
        const oldestRequest = this.requests[0];
        const waitMs = this.windowMs - (now - oldestRequest);

        return {
            allowed: false,
            waitMs: Math.max(0, waitMs),
            requestCount: this.requests.length
        };
    }

    recordRequest(): void {
        this.requests.push(Date.now());
    }

    getStats(): { count: number; limit: number; resetsIn: number } {
        const now = Date.now();
        this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);

        const resetsIn = this.requests.length > 0
            ? this.windowMs - (now - this.requests[0])
            : 0;

        return {
            count: this.requests.length,
            limit: this.maxRequests,
            resetsIn
        };
    }
}

// Singleton instance
export const geminiRateLimiter = new GeminiRateLimiter();
