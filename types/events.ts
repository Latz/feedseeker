/**
 * @fileoverview Event type definitions for FeedSeeker
 *
 * This module defines discriminated union types for all events emitted
 * throughout the FeedSeeker application, providing type-safe event handling.
 *
 * @module types/events
 * @version 1.0.0
 */

import type { Feed } from '../modules/metaLinks.js';

/**
 * Event data for module start events
 */
export interface StartEventData {
	module: string;
	niceName: string;
	endpointUrls?: number;
}

/**
 * Event data for module end events
 */
export interface EndEventData {
	module: string;
	feeds: Feed[];
	visitedUrls?: number;
}

/**
 * Event data for error events
 */
export interface ErrorEventData {
	module: string;
	error: string;
	cause?: unknown;
	explanation?: string;
	suggestion?: string;
}

/**
 * Event data for metalinks log events
 */
export interface MetaLinksLogData {
	module: 'metalinks';
	message?: string;
	url?: string;
	reason?: string;
}

/**
 * Event data for anchors log events
 */
export interface AnchorsLogData {
	module: 'anchors';
	totalCount?: number;
	totalEndpoints?: number;
	message?: string;
}

/**
 * Event data for blindsearch log events
 */
export interface BlindSearchLogData {
	module: 'blindsearch';
	totalCount?: number;
	totalEndpoints?: number;
	feedsFound?: number;
	message?: string;
	url?: string;
	reason?: string;
}

/**
 * Event data for deepsearch log events
 */
export interface DeepSearchLogData {
	module: 'deepSearch';
	url?: string;
	depth?: number;
	error?: string;
	message?: string;
	feedCheck?: {
		isFeed: boolean;
		type?: 'rss' | 'atom' | 'json';
	};
}

/**
 * Discriminated union type for all log event data
 */
export type LogEventData =
	| MetaLinksLogData
	| AnchorsLogData
	| BlindSearchLogData
	| DeepSearchLogData;

/**
 * Type for event emitter functions
 */
export interface EventEmitter {
	(event: 'start', data: StartEventData): void;
	(event: 'end', data: EndEventData): void;
	(event: 'error', data: ErrorEventData): void;
	(event: 'log', data: LogEventData): void;
	(event: 'initialized'): void;
	(event: string, data?: unknown): void;
}
