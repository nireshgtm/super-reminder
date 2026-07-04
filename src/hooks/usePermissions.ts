import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

export type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | null; // null = not yet checked

export interface UsePermissionsResult {
  /** null while the first async check is in-flight. */
  status: NotificationPermissionStatus;
  isGranted: boolean;
  isDenied: boolean;
  /** True until the first check resolves. */
  isLoading: boolean;
  /** Re-read permission status from the OS (does NOT prompt). */
  check: () => Promise<void>;
  /**
   * Show the OS permission dialog once. iOS allows only one native prompt;
   * subsequent calls return the already-stored status without a dialog.
   * Per P4: _layout.tsx calls this once on cold launch only.
   */
  request: () => Promise<NotificationPermissionStatus>;
}

export function usePermissions(): UsePermissionsResult {
  const [status, setStatus] = useState<NotificationPermissionStatus>(null);
  // Guard so AppState listener never fires before the hook is mounted.
  const mountedRef = useRef(true);

  const check = useCallback(async () => {
    const { status: s } = await Notifications.getPermissionsAsync();
    if (mountedRef.current) setStatus(s as NotificationPermissionStatus);
  }, []);

  const request = useCallback(async (): Promise<NotificationPermissionStatus> => {
    const { status: s } = await Notifications.requestPermissionsAsync();
    if (mountedRef.current) setStatus(s as NotificationPermissionStatus);
    return s as NotificationPermissionStatus;
  }, []);

  useEffect(() => {
    // Initial check on mount (not a prompt — just reads current OS state).
    check();

    // Re-check whenever the app returns to the foreground. This catches:
    //   • User granting permission in system Settings then returning
    //   • User revoking permission in system Settings then returning
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') check();
    });

    return () => {
      mountedRef.current = false;
      sub.remove();
    };
  }, [check]);

  return {
    status,
    isGranted: status === 'granted',
    isDenied: status === 'denied',
    isLoading: status === null,
    check,
    request,
  };
}
