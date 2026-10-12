import { useEffect, useState, useCallback } from "react";
import signalRService, {
  ConnectionState,
  Notification,
  UserStatusUpdate,
  NotificationHandler,
  UserStatusHandler,
  ConnectionStateHandler,
} from "@/lib/services/signalr-service";
import { useApiReady, useAuth } from "@/lib/auth";

export interface UseSignalRReturn {
  isConnected: boolean;
  connectionState: ConnectionState;
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
  const { user } = useAuth();
  const apiReady = useApiReady();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userStatuses, setUserStatuses] = useState<
    Map<string, UserStatusUpdate>
  >(new Map());

  // Handle incoming notifications
  const handleNotification: NotificationHandler = useCallback(
    (notification: Notification) => {
      setNotifications((prev) => {
        // Deduplicate by id
        if (prev.some((n) => n.id === notification.id)) return prev;
        return [notification, ...prev].slice(0, 50);
      });
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
    (state: ConnectionState) => {
      setConnectionState(state);
      setIsConnected(state === ConnectionState.Connected);
    },
    [],
  );

  // Connect
  const connect = useCallback(async () => {
    if (!apiReady || !user) return;

    try {
      await signalRService.start();
    } catch (error) {
      console.error("Failed to connect to notification stream:", error);
    }
  }, [apiReady, user]);

  // Disconnect
  const disconnect = useCallback(async () => {
    try {
      await signalRService.stop();
    } catch (error) {
      console.error("Failed to disconnect from notification stream:", error);
    }
  }, []);

  // No-ops kept for API compatibility (SSE is server→client only)
  const joinGroup = useCallback(async (_groupName: string) => {}, []);
  const leaveGroup = useCallback(async (_groupName: string) => {}, []);
  const updateStatus = useCallback(
    async (_status: "online" | "away" | "busy" | "offline") => {},
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
    if (!apiReady || !user) {
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
    apiReady,
    user,
    connect,
    disconnect,
    handleNotification,
    handleUserStatusUpdate,
    handleConnectionStateChange,
  ]);

  // Auto-disconnect when user logs out
  useEffect(() => {
    if (!apiReady) {
      disconnect();
      setNotifications([]);
      setUserStatuses(new Map());
    }
  }, [apiReady, disconnect]);

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
