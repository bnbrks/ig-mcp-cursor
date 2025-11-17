/**
 * Session Manager for storing IG sessions per connection
 * This ensures sessions are isolated per MCP connection/context
 */

import type { IGSession, IGCredentials } from './types.js';

interface ConnectionSession {
  session: IGSession | null;
  credentials: IGCredentials | null;
}

// Store sessions per connection identifier
// In a real MCP server, you'd use the connection context
// For now, we'll use a simple in-memory store with connection IDs
const sessions = new Map<string, ConnectionSession>();

export class SessionManager {
  /**
   * Get or create a session store for a connection
   */
  static getSessionStore(connectionId: string): ConnectionSession {
    if (!sessions.has(connectionId)) {
      sessions.set(connectionId, {
        session: null,
        credentials: null,
      });
    }
    return sessions.get(connectionId)!;
  }

  /**
   * Store session for a connection
   */
  static setSession(connectionId: string, session: IGSession): void {
    const store = this.getSessionStore(connectionId);
    store.session = session;
  }

  /**
   * Get session for a connection
   */
  static getSession(connectionId: string): IGSession | null {
    const store = this.getSessionStore(connectionId);
    return store.session;
  }

  /**
   * Store credentials for a connection (optional, for reference)
   */
  static setCredentials(connectionId: string, credentials: IGCredentials): void {
    const store = this.getSessionStore(connectionId);
    store.credentials = credentials;
  }

  /**
   * Clear session and credentials for a connection
   */
  static clearSession(connectionId: string): void {
    const store = this.getSessionStore(connectionId);
    store.session = null;
    store.credentials = null;
  }

  /**
   * Check if connection has an authenticated session
   */
  static isAuthenticated(connectionId: string): boolean {
    const session = this.getSession(connectionId);
    return session?.authenticated === true;
  }

  /**
   * Clear all sessions (useful for cleanup)
   */
  static clearAll(): void {
    sessions.clear();
  }

  /**
   * Get all sessions (for finding authenticated connections)
   */
  static getAllSessions(): IterableIterator<[string, IGSession | null]> {
    const result = new Map<string, IGSession | null>();
    for (const [connId, store] of sessions.entries()) {
      result.set(connId, store.session);
    }
    return result.entries();
  }

  /**
   * Generate a connection ID
   * In a real implementation, this would come from the MCP connection context
   * For now, we'll use a simple timestamp-based ID
   */
  static generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}

