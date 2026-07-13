import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import notifee, { AuthorizationStatus } from '@notifee/react-native';

export type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | null; // null = not yet checked

export interface UsePermissionsResult {
  status: NotificationPermissionStatus;
  isGranted: boolean;
  isDenied: boolean;
  isLoading: boolean;
  check: () => Promise<void>;
  request: () => Promise<NotificationPermissionStatus>;
}

function toStatus(authorizationStatus: AuthorizationStatus): NotificationPermissionStatus {
  switch (authorizationStatus) {
    case AuthorizationStatus.AUTHORIZED:
    case AuthorizationStatus.PROVISIONAL:
    case AuthorizationStatus.EPHEMERAL:
      return 'granted';
    case AuthorizationStatus.DENIED:
      return 'denied';
    default:
      return 'undetermined';
  }
}

export function usePermissions(): UsePermissionsResult {
  const [status, setStatus] = useState<NotificationPermissionStatus>(null);
  const mountedRef = useRef(true);

  const check = useCallback(async () => {
    const settings = await notifee.getNotificationSettings();
    if (mountedRef.current) setStatus(toStatus(settings.authorizationStatus));
  }, []);

  const request = useCallback(async (): Promise<NotificationPermissionStatus> => {
    const settings = await notifee.requestPermission();
    const s = toStatus(settings.authorizationStatus);
    if (mountedRef.current) setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    check();

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
