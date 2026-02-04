// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// JSDOM doesn't provide EventSource; our dashboard uses SSE.
// Provide a minimal mock so components can mount during unit tests.
class MockEventSource {
	url: string;
	readyState = 0;
	onopen: ((this: EventSource, ev: Event) => any) | null = null;
	onmessage: ((this: EventSource, ev: MessageEvent) => any) | null = null;
	onerror: ((this: EventSource, ev: Event) => any) | null = null;

	constructor(url: string) {
		this.url = url;
		// simulate async open
		setTimeout(() => {
			this.readyState = 1;
			this.onopen?.call((this as unknown) as EventSource, new Event('open'));
		}, 0);
	}

	close() {
		this.readyState = 2;
	}
}

// @ts-expect-error attach to global
global.EventSource = MockEventSource;
