import { h } from 'preact';
import { useState } from 'preact/hooks';
import { HostInfo, ControllerSettings } from '../protocol/types';
import { DashboardShell, DashboardTab } from './DashboardShell';
import { HomePage } from './pages/HomePage';
import { ControllersPage } from './pages/ControllersPage';
import { SettingsPage } from './pages/SettingsPage';
import { AboutPage } from './pages/AboutPage';

interface DashboardViewProps {
  hostInfo: HostInfo;
  onDisconnectClient: (slot?: number) => void;
  onOpenMobileController: () => void;
  settings?: ControllerSettings;
  onUpdateSettings?: (settings: ControllerSettings) => void;
}

export function DashboardView({
  hostInfo,
  onDisconnectClient,
  onOpenMobileController,
  settings,
  onUpdateSettings,
}: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('home');

  const handleRefreshStatus = async () => {
    try {
      await fetch('/api/status');
    } catch {
      // offline/silent
    }
  };

  return (
    <DashboardShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      hostInfo={hostInfo}
      onRefreshStatus={handleRefreshStatus}
    >
      {activeTab === 'home' && (
        <HomePage
          hostInfo={hostInfo}
          onDisconnectClient={onDisconnectClient}
          onOpenMobileController={onOpenMobileController}
          onNavigateToControllers={() => setActiveTab('controllers')}
          onNavigateToSettings={() => setActiveTab('settings')}
        />
      )}

      {activeTab === 'controllers' && (
        <ControllersPage
          hostInfo={hostInfo}
          onDisconnectClient={onDisconnectClient}
          onOpenMobileController={onOpenMobileController}
          onNavigateToHome={() => setActiveTab('home')}
          onNavigateToSettings={() => setActiveTab('settings')}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsPage
          hostInfo={hostInfo}
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          onRefreshStatus={handleRefreshStatus}
        />
      )}

      {activeTab === 'about' && (
        <AboutPage onNavigateToHome={() => setActiveTab('home')} />
      )}
    </DashboardShell>
  );
}
