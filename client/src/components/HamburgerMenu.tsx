import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, MessageSquare, Settings, User, HelpCircle, LogOut } from "lucide-react";
import ThreadHistory from "@/components/ThreadHistory";

interface HamburgerMenuProps {
  currentThreadId: string | null;
  onThreadSelect: (threadId: string) => void;
  onNewThread: () => void;
}

export default function HamburgerMenu({ currentThreadId, onThreadSelect, onNewThread }: HamburgerMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="text-gray-600 hover:text-primary">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-96">
        <SheetHeader>
          <SheetTitle className="text-left">Menu</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-6 mt-6">
          {/* Conversations Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-sm font-semibold text-gray-900">
              <MessageSquare className="w-4 h-4" />
              <span>Conversations</span>
            </div>
            <div className="pl-6">
              <ThreadHistory 
                currentThreadId={currentThreadId}
                onThreadSelect={(threadId) => {
                  onThreadSelect(threadId);
                  setOpen(false);
                }}
                onNewThread={() => {
                  onNewThread();
                  setOpen(false);
                }}
              />
            </div>
          </div>

          {/* Settings Section */}
          <div className="space-y-3 border-t pt-6">
            <div className="flex items-center space-x-2 text-sm font-semibold text-gray-900">
              <Settings className="w-4 h-4" />
              <span>Settings & More</span>
            </div>
            
            <div className="space-y-2 pl-6">
              <Button variant="ghost" className="w-full justify-start text-sm text-gray-600 hover:text-primary">
                <User className="w-4 h-4 mr-3" />
                Profile Settings
              </Button>
              <Button variant="ghost" className="w-full justify-start text-sm text-gray-600 hover:text-primary">
                <Settings className="w-4 h-4 mr-3" />
                Preferences
              </Button>
              <Button variant="ghost" className="w-full justify-start text-sm text-gray-600 hover:text-primary">
                <HelpCircle className="w-4 h-4 mr-3" />
                Help & Support
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-sm text-gray-600 hover:text-red-600"
                onClick={() => window.location.href = "/api/logout"}
              >
                <LogOut className="w-4 h-4 mr-3" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}