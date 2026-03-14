import { useEffect, useState, useCallback } from "react";
import { HubConnectionState } from "@microsoft/signalr";
import signalRService, {
  Notification,
  UserStatusUpdate,
  NotificationHandler,
  UserStatusHandler,
  ConnectionStateHandler,
} from "@/lib/services/signalr-service";
import { useAuth } from "@/lib/auth";

export interface UseSignalRReturn {
  isConnected: boolean;
  connectionState: HubConnectionState;
  notifications: Notification[];
  userStatuses: Map<string, UserStatusUpdate>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  joinGroup: (groupName: string) => Promise<void>;
  leaveGroup: (groupName: string) => Promise<void>;
  updateStatus: (
    status: "online" | "away" | "busy" | "offline",
  ) => Promise<void>;
  markNotificationAsRead: (notificationId: string) => void;
  clearNotifications: () => void;
}

export function useSignalR(): UseSignalRReturn {
  const { user, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<HubConnectionState>(
    HubConnectionState.Disconnected,
  );
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userStatuses, setUserStatuses] = useState<
    Map<string, UserStatusUpdate>
  >(new Map());

  // Handle incoming notifications
  const handleNotification: NotificationHandler = useCallback(
    (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 50)); // Keep only last 50 notifications
    },
    [],
  );

  // Handle user status updates
  const handleUserStatusUpdate: UserStatusHandler = useCallback(
    (statusUpdate: UserStatusUpdate) => {
      setUserStatuses((prev) => {
        const newMap = new Map(prev);
        newMap.set(statusUpdate.userId, statusUpdate);
        return newMap;
      });
    },
    [],
  );

  // Handle connection state changes
  const handleConnectionStateChange: ConnectionStateHandler = useCallback(
    (state: HubConnectionState) => {
      setConnectionState(state);
      setIsConnected(state === HubConnectionState.Connected);
    },
    [],
  );

  // Connect to SignalR
  const connect = useCallback(async () => {
    if (!isAuthenticated || !user) {
      console.log("Cannot connect to SignalR: user not authenticated");
      return;
    }

    try {
      await signalRService.start();
      console.log("SignalR connected successfully");
    } catch (error) {
      console.error("Failed to connect to SignalR:", error);
    }
  }, [isAuthenticated, user]);

  // Disconnect from SignalR
  const disconnect = useCallback(async () => {
    try {
      await signalRService.stop();
      console.log("SignalR disconnected successfully");
    } catch (error) {
      console.error("Failed to disconnect from SignalR:", error);
    }
  }, []);

  // Join a group
  const joinGroup = useCallback(async (groupName: string) => {
    await signalRService.joinGroup(groupName);
  }, []);

  // Leave a group
  const leaveGroup = useCallback(async (groupName: string) => {
    await signalRService.leaveGroup(groupName);
  }, []);

  // Update user status
  const updateStatus = useCallback(
    async (status: "online" | "away" | "busy" | "offline") => {
      await signalRService.updateStatus(status);
    },
    [],
  );

  // Mark notification as read
  const markNotificationAsRead = useCallback((notificationId: string) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId
          ? { ...notification, isRead: true }
          : notification,
      ),
    );
  }, []);

  // Clear all notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Set up event handlers and auto-connect when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user) {
      disconnect();
      return;
    }

    // Register event handlers
    const unsubscribeNotification =
      signalRService.onNotification(handleNotification);
    const unsubscribeUserStatus = signalRService.onUserStatusChange(
      handleUserStatusUpdate,
    );
    const unsubscribeConnectionState = signalRService.onConnectionStateChange(
      handleConnectionStateChange,
    );

    // Auto-connect when authenticated
    connect();

    // Set initial connection state
    setConnectionState(signalRService.connectionState);
    setIsConnected(signalRService.isConnected);

    // Cleanup function
    return () => {
      unsubscribeNotification();
      unsubscribeUserStatus();
      unsubscribeConnectionState();
    };
  }, [
    isAuthenticated,
    user,
    connect,
    disconnect,
    handleNotification,
    handleUserStatusUpdate,
    handleConnectionStateChange,
  ]);

  // Auto-disconnect when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      disconnect();
      setNotifications([]);
      setUserStatuses(new Map());
    }
  }, [isAuthenticated, disconnect]);

  // Update status to online when connected
  useEffect(() => {
    if (isConnected && isAuthenticated) {
      updateStatus("online");
    }
  }, [isConnected, isAuthenticated, updateStatus]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (isConnected && isAuthenticated) {
        const status = document.hidden ? "away" : "online";
        updateStatus(status);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isConnected, isAuthenticated, updateStatus]);

  // Handle pagehide instead of beforeunload to preserve BFCache
  useEffect(() => {
    const handlePageHide = () => {
      if (isConnected && isAuthenticated) {
        updateStatus("offline");
      }
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [isConnected, isAuthenticated, updateStatus]);

  return {
    isConnected,
    connectionState,
    notifications,
    userStatuses,
    connect,
    disconnect,
    joinGroup,
    leaveGroup,
    updateStatus,
    markNotificationAsRead,
    clearNotifications,
  };
}
