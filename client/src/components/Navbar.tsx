import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, MessageSquare, FolderOpen, Brain } from "lucide-react";
import magnifyingGlassImage from "@assets/magnifying-glass-search-black-icon-transparent-background-701751694974241svd11gtb6h_1755712552612.png";

interface NavbarProps {
  activeTab: 'ask' | 'explore' | 'insights';
  onTabChange: (tab: 'ask' | 'explore' | 'insights') => void;
}

export default function Navbar({ activeTab, onTabChange }: NavbarProps) {
  const { user } = useAuth();

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return "U";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo Section */}
          <div className="flex items-center space-x-3">
            <img 
              src={magnifyingGlassImage} 
              alt="Magnifying Glass" 
              className="w-8 h-8 object-contain"
            />
            <div className="flex flex-col">
              <span className="text-xl font-semibold text-gray-900 leading-tight">Come Near</span>
              <span className="text-sm text-gray-600 font-medium leading-tight">Ranier</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-2">
            <Button
              variant={activeTab === 'ask' ? 'default' : 'ghost'}
              className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                activeTab === 'ask' 
                  ? 'text-primary border-b-2 border-primary bg-transparent hover:bg-transparent' 
                  : 'text-gray-600 hover:text-primary'
              }`}
              onClick={() => onTabChange('ask')}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Ask
            </Button>
            <Button
              variant={activeTab === 'explore' ? 'default' : 'ghost'}
              className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                activeTab === 'explore' 
                  ? 'text-primary border-b-2 border-primary bg-transparent hover:bg-transparent' 
                  : 'text-gray-600 hover:text-primary'
              }`}
              onClick={() => onTabChange('explore')}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Data
            </Button>
            <Button
              variant={activeTab === 'insights' ? 'default' : 'ghost'}
              className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                activeTab === 'insights' 
                  ? 'text-primary border-b-2 border-primary bg-transparent hover:bg-transparent' 
                  : 'text-gray-600 hover:text-primary'
              }`}
              onClick={() => onTabChange('insights')}
            >
              <Brain className="w-4 h-4 mr-2" />
              Insights
            </Button>
          </div>

          {/* User Profile */}
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" className="text-gray-600 hover:text-primary">
              <Bell className="h-5 w-5" />
            </Button>
            <div className="flex items-center space-x-3">
              <Avatar className="w-8 h-8">
                <AvatarImage src={user?.profileImageUrl || ""} />
                <AvatarFallback className="bg-primary text-white text-sm">
                  {getInitials(user?.firstName || undefined, user?.lastName || undefined)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:block text-sm font-medium text-gray-900">
                {user?.firstName || user?.lastName 
                  ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                  : user?.email || "User"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
