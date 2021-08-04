// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useCallback, useMemo } from "react";
import { useToasts } from "react-toast-notifications";
import { useInterval, useNetworkState } from "react-use";

import { useShallowMemo, useVisibilityState } from "@foxglove/hooks";
import Logger from "@foxglove/log";
import { AppSetting } from "@foxglove/studio-base/AppSetting";
import { useConsoleApi } from "@foxglove/studio-base/context/ConsoleApiContext";
import { useCurrentUser } from "@foxglove/studio-base/context/CurrentUserContext";
import { useLayoutCache } from "@foxglove/studio-base/context/LayoutCacheContext";
import LayoutStorageContext from "@foxglove/studio-base/context/LayoutStorageContext";
import LayoutStorageDebuggingContext from "@foxglove/studio-base/context/LayoutStorageDebuggingContext";
import { useAppConfigurationValue } from "@foxglove/studio-base/hooks/useAppConfigurationValue";
import CacheOnlyLayoutStorage from "@foxglove/studio-base/services/CacheOnlyLayoutStorage";
import ConsoleApiRemoteLayoutStorage from "@foxglove/studio-base/services/ConsoleApiRemoteLayoutStorage";
import OfflineLayoutStorage from "@foxglove/studio-base/services/OfflineLayoutStorage";

const log = Logger.getLogger(__filename);

const SYNC_INTERVAL = 15_000;

export default function ConsoleApiLayoutStorageProvider({
  children,
}: React.PropsWithChildren<unknown>): JSX.Element {
  const { addToast } = useToasts();
  const [enableConsoleApiLayouts = false] = useAppConfigurationValue<boolean>(
    AppSetting.ENABLE_CONSOLE_API_LAYOUTS,
  );
  const api = useConsoleApi();
  const currentUser = useCurrentUser();

  const apiStorage = useMemo(() => new ConsoleApiRemoteLayoutStorage(api), [api]);

  const layoutCache = useLayoutCache();
  const cacheOnlyStorage = useMemo(() => new CacheOnlyLayoutStorage(layoutCache), [layoutCache]);

  const offlineStorage = useMemo(
    () => new OfflineLayoutStorage({ cacheStorage: layoutCache, remoteStorage: apiStorage }),
    [layoutCache, apiStorage],
  );

  const sync = useCallback(async () => {
    try {
      const conflicts = await offlineStorage.syncWithRemote();
      log.info("synced, conflicts:", conflicts);
    } catch (error) {
      addToast(`Sync failed: ${error.message}`, {
        id: "ConsoleApiLayoutStorageProvider.syncError",
        appearance: "error",
      });
    }
  }, [addToast, offlineStorage]);

  const { online = false } = useNetworkState();
  const visibilityState = useVisibilityState();

  // Sync periodically when logged in, online, and the app is not hidden
  useInterval(
    sync,
    currentUser && online && visibilityState === "visible"
      ? SYNC_INTERVAL
      : null /* eslint-disable-line no-restricted-syntax */,
  );

  const debugging = useShallowMemo({ syncNow: sync });

  return (
    <LayoutStorageDebuggingContext.Provider
      value={process.env.NODE_ENV !== "production" && currentUser ? debugging : undefined}
    >
      <LayoutStorageContext.Provider
        value={enableConsoleApiLayouts && currentUser ? offlineStorage : cacheOnlyStorage}
      >
        {children}
      </LayoutStorageContext.Provider>
    </LayoutStorageDebuggingContext.Provider>
  );
}
