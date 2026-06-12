import {
  getAdminNavIconName,
  type AdminNavIconName,
} from "@/lib/admin-nav-icons";

export type AdminTab = {
  href: string;
  label: string;
  icon: AdminNavIconName;
};

export type ShellTenant = {
  business_name: string;
  booking_tool?: string | null;
  checkout_mode?: string | null;
  profile_image_url?: string | null;
};

export function buildAdminTabs(tenant: ShellTenant): AdminTab[] {
  const showSchedule =
    !tenant.booking_tool ||
    tenant.booking_tool === "none" ||
    tenant.booking_tool === "internal";
  const showOrders = tenant.checkout_mode === "pickup";
  const tabs: AdminTab[] = [
    { href: "/admin", label: "Home", icon: getAdminNavIconName("Home") },
  ];

  if (showSchedule) {
    tabs.push({
      href: "/admin/schedule",
      label: "Schedule",
      icon: getAdminNavIconName("Schedule"),
    });
    tabs.push({
      href: "/admin/services",
      label: "Services",
      icon: getAdminNavIconName("Services"),
    });
  }
  if (showOrders) {
    tabs.push({
      href: "/admin/orders",
      label: "Orders",
      icon: getAdminNavIconName("Orders"),
    });
  }

  tabs.push(
    {
      href: "/admin/photos",
      label: "Photos",
      icon: getAdminNavIconName("Photos"),
    },
    {
      href: "/admin/updates",
      label: "Updates",
      icon: getAdminNavIconName("Updates"),
    },
    {
      href: "/admin/leads",
      label: "Leads",
      icon: getAdminNavIconName("Leads"),
    },
    {
      href: "/admin/billing",
      label: "Billing",
      icon: getAdminNavIconName("Billing"),
    },
    {
      href: "/admin/profile",
      label: "Profile",
      icon: getAdminNavIconName("Profile"),
    },
  );

  return tabs;
}
