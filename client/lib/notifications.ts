// Notification service for visits
export type NotificationPermission = "granted" | "denied" | "default";

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    console.log("Navegador não suporta notificações");
    return "denied";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission !== "denied") {
    try {
      const permission = await Notification.requestPermission();
      return permission as NotificationPermission;
    } catch (error) {
      console.error("Erro ao pedir permissão de notificação:", error);
      return "denied";
    }
  }

  return "denied";
}

export function getNotificationPermission(): NotificationPermission {
  if (!("Notification" in window)) {
    return "denied";
  }
  return Notification.permission as NotificationPermission;
}

export function sendNotification(title: string, options?: NotificationOptions): Notification | null {
  if (!("Notification" in window)) {
    console.log("Navegador não suporta notificações");
    return null;
  }

  if (Notification.permission !== "granted") {
    console.log("Permissão para notificações não concedida");
    return null;
  }

  try {
    return new Notification(title, {
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      ...options,
    });
  } catch (error) {
    console.error("Erro ao enviar notificação:", error);
    return null;
  }
}

export function checkUpcomingVisits(visits: Array<{ visitDate: string; visitTime: string; address: string }>) {
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

  const upcomingVisits = visits.filter(visit => {
    const visitDateTime = new Date(`${visit.visitDate}T${visit.visitTime}`);
    return visitDateTime >= now && visitDateTime <= oneHourLater && visitDateTime > now;
  });

  return upcomingVisits;
}

// Service Worker registration for background notifications
export async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      // Try to register the service worker
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        console.log("Service Worker registrado com sucesso:", registration);
        return registration;
      } catch (swError: any) {
        // If sw.js doesn't exist or has issues, fall back to no service worker
        // This is not critical - the app still works without it
        console.warn("Service Worker não disponível:", swError?.message);
        return null;
      }
    } catch (error) {
      console.error("Erro ao registrar Service Worker:", error);
      return null;
    }
  }
  return null;
}

// Send notification via service worker for background notifications
export async function sendBackgroundNotification(title: string, options?: NotificationOptions) {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SHOW_NOTIFICATION",
      title,
      options,
    });
  }
}
