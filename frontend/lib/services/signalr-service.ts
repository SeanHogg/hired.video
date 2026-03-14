import * as signalR from "@microsoft/signalr";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "job_application";
  data?: any;
  timestamp: string;
  isRead: boolean;
}

export interface UserStatusUpdate {
  userId: string;
  userName: string;
  status: "online" | "away" | "busy" | "offline";
  timestamp: string;
}

export type NotificationHandler = (notification: Notification) => void;
export type UserStatusHandler = (statusUpdate: UserStatusUpdate) => void;
export type ConnectionStateHandler = (
  state: signalR.HubConnectionState,
) => void;

class SignalRService {
  private connection: signalR.HubConnection | null = null;
  private notificationHandlers: NotificationHandler[] = [];
  private userStatusHandlers: UserStatusHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];

  constructor() {
    this.initializeConnection();
  }

  private initializeConnection(): void {
    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${apiBaseUrl}/api/hubs/notifications`, {
        accessTokenFactory: () => {
          // Get the auth token from localStorage
          return localStorage.getItem("authToken") || "";
        },
        withCredentials: true,
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          // Exponential backoff: 0, 2, 10, 30 seconds, then 30 seconds
          if (retryContext.previousRetryCount === 0) return 0;
          if (retryContext.previousRetryCount === 1) return 2000;
          if (retryContext.previousRetryCount === 2) return 10000;
          return 30000;
        },
      })
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.connection) return;

    // Handle incoming notifications
    this.connection.on("ReceiveNotification", (notification: Notification) => {
      console.log("Received notification:", notification);
      this.notificationHandlers.forEach((handler) => handler(notification));
    });

    // Handle user status changes
    this.connection.on(
      "UserStatusChanged",
      (statusUpdate: UserStatusUpdate) => {
        console.log("User status changed:", statusUpdate);
        this.userStatusHandlers.forEach((handler) => handler(statusUpdate));
      },
    );

    // Handle broadcast messages
    this.connection.on("BroadcastMessage", (data: any) => {
      console.log("Broadcast message:", data);
      const notification: Notification = {
        id: `broadcast_${Date.now()}`,
        title: "System Announcement",
        message: data.message,
        type: "info",
        data: data,
        timestamp: data.timestamp,
        isRead: false,
      };
      this.notificationHandlers.forEach((handler) => handler(notification));
    });

    // Handle connection state changes
    this.connection.onreconnecting(() => {
      console.log("SignalR reconnecting...");
      this.connectionStateHandlers.forEach((handler) =>
        handler(signalR.HubConnectionState.Reconnecting),
      );
    });

    this.connection.onreconnected(() => {
      console.log("SignalR reconnected");
      this.connectionStateHandlers.forEach((handler) =>
        handler(signalR.HubConnectionState.Connected),
      );
    });

    this.connection.onclose(() => {
      console.log("SignalR connection closed");
      this.connectionStateHandlers.forEach((handler) =>
        handler(signalR.HubConnectionState.Disconnected),
      );
    });
  }

  async start(): Promise<void> {
    if (!this.connection) {
      this.initializeConnection();
    }

    if (this.connection?.state === signalR.HubConnectionState.Disconnected) {
      try {
        await this.connection.start();
        console.log("SignalR connection started");
        this.connectionStateHandlers.forEach((handler) =>
          handler(signalR.HubConnectionState.Connected),
        );
      } catch (error) {
        console.error("Error starting SignalR connection:", error);
        throw error;
      }
    }
  }

  async stop(): Promise<void> {
    if (
      this.connection &&
      this.connection.state !== signalR.HubConnectionState.Disconnected
    ) {
      try {
        await this.connection.stop();
        console.log("SignalR connection stopped");
      } catch (error) {
        console.error("Error stopping SignalR connection:", error);
      }
    }
  }

  async joinGroup(groupName: string): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke("JoinGroup", groupName);
        console.log(`Joined group: ${groupName}`);
      } catch (error) {
        console.error(`Error joining group ${groupName}:`, error);
      }
    }
  }

  async leaveGroup(groupName: string): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke("LeaveGroup", groupName);
        console.log(`Left group: ${groupName}`);
      } catch (error) {
        console.error(`Error leaving group ${groupName}:`, error);
      }
    }
  }

  async updateStatus(
    status: "online" | "away" | "busy" | "offline",
  ): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke("UpdateStatus", status);
        console.log(`Status updated to: ${status}`);
      } catch (error) {
        console.error(`Error updating status to ${status}:`, error);
      }
    }
  }

  // Event handler registration methods
  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.push(handler);
    return () => {
      const index = this.notificationHandlers.indexOf(handler);
      if (index > -1) {
        this.notificationHandlers.splice(index, 1);
      }
    };
  }

  onUserStatusChange(handler: UserStatusHandler): () => void {
    this.userStatusHandlers.push(handler);
    return () => {
      const index = this.userStatusHandlers.indexOf(handler);
      if (index > -1) {
        this.userStatusHandlers.splice(index, 1);
      }
    };
  }

  onConnectionStateChange(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.push(handler);
    return () => {
      const index = this.connectionStateHandlers.indexOf(handler);
      if (index > -1) {
        this.connectionStateHandlers.splice(index, 1);
      }
    };
  }

  get connectionState(): signalR.HubConnectionState {
    return this.connection?.state || signalR.HubConnectionState.Disconnected;
  }

  get isConnected(): boolean {
    return this.connection?.state === signalR.HubConnectionState.Connected;
  }
}

// Export a singleton instance
export const signalRService = new SignalRService();
export default signalRService;
