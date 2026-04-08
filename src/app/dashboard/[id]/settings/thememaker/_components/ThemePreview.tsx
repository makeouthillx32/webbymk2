// app/dashboard/[id]/settings/thememaker/_components/ThemePreview.tsx

"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, CheckCircle, User, Calendar, MessageSquare, Settings } from 'lucide-react';

interface ThemePreviewProps {
  currentTheme: {
    name: string;
    description: string;
    previewColor: string;
    fonts: {
      sans: string;
      serif: string;
      mono: string;
    };
    radii: {
      radius: string;
    };
    light: Record<string, string>;
    dark: Record<string, string>;
    [key: string]: any;
  };
  mode: 'light' | 'dark';
}

export const ThemePreview: React.FC<ThemePreviewProps> = ({
  currentTheme,
  mode
}) => {
  const applyThemeStyles = () => {
    const root = document.documentElement;
    const themeVars = currentTheme[mode];
    
    // Apply theme variables
    Object.entries(themeVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    
    // Apply font variables
    root.style.setProperty('--font-sans', currentTheme.fonts.sans);
    root.style.setProperty('--font-serif', currentTheme.fonts.serif);
    root.style.setProperty('--font-mono', currentTheme.fonts.mono);
    root.style.setProperty('--radius', currentTheme.radii.radius);
  };

  React.useEffect(() => {
    applyThemeStyles();
  }, [currentTheme, mode]);

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Theme Preview</h2>
          <p className="text-muted-foreground">
            Preview your theme in real-time as you make changes
          </p>
          {currentTheme.name && (
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="outline">{currentTheme.name}</Badge>
              {currentTheme.description && (
                <span className="text-sm text-muted-foreground">
                  {currentTheme.description}
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Colors Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded-full" 
                  style={{ backgroundColor: currentTheme.previewColor }}
                />
                Colors Preview
              </CardTitle>
              <CardDescription>
                Primary color variations and system colors
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Primary Color Swatches */}
              <div>
                <h4 className="text-sm font-medium mb-3">Primary Colors</h4>
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-lg bg-primary mx-auto mb-2 border border-border"></div>
                    <div className="text-xs text-muted-foreground">Primary</div>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-lg bg-secondary mx-auto mb-2 border border-border"></div>
                    <div className="text-xs text-muted-foreground">Secondary</div>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-lg bg-accent mx-auto mb-2 border border-border"></div>
                    <div className="text-xs text-muted-foreground">Accent</div>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-lg bg-destructive mx-auto mb-2 border border-border"></div>
                    <div className="text-xs text-muted-foreground">Destructive</div>
                  </div>
                </div>
              </div>

              {/* Chart Colors */}
              <div>
                <h4 className="text-sm font-medium mb-3">Chart Colors</h4>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <div key={num} className="text-center">
                      <div 
                        className="w-8 h-8 rounded mx-auto mb-1"
                        style={{ backgroundColor: `hsl(var(--chart-${num}))` }}
                      ></div>
                      <div className="text-xs text-muted-foreground">Chart {num}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Background Colors */}
              <div>
                <h4 className="text-sm font-medium mb-3">Background Colors</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-lg bg-background mx-auto mb-2 border border-border"></div>
                    <div className="text-xs text-muted-foreground">Background</div>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-lg bg-muted mx-auto mb-2 border border-border"></div>
                    <div className="text-xs text-muted-foreground">Muted</div>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-lg bg-card mx-auto mb-2 border border-border"></div>
                    <div className="text-xs text-muted-foreground">Card</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Typography Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Typography</CardTitle>
              <CardDescription>
                Font families and text styling
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Font Families</h4>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Sans-serif</div>
                    <p className="font-sans text-base">The quick brown fox jumps over the lazy dog</p>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Serif</div>
                    <p className="font-serif text-base">The quick brown fox jumps over the lazy dog</p>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Monospace</div>
                    <p className="font-mono text-sm">The quick brown fox jumps over the lazy dog</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Text Sizes</h4>
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Small text (12px)</div>
                  <div className="text-sm text-foreground">Regular text (14px)</div>
                  <div className="text-base text-foreground">Base text (16px)</div>
                  <div className="text-lg text-foreground">Large text (18px)</div>
                  <div className="text-xl text-foreground">Extra large text (20px)</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Components Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Interactive Components</CardTitle>
              <CardDescription>
                Buttons, inputs, and other UI elements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-3">Buttons</h4>
                <div className="flex flex-wrap gap-2">
                  <Button variant="default">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Destructive</Button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">Form Elements</h4>
                <div className="space-y-3">
                  <Input placeholder="Input field" />
                  <Textarea placeholder="Textarea field" rows={3} />
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="check1" className="rounded" />
                    <label htmlFor="check1" className="text-sm">Checkbox option</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="radio" id="radio1" name="radio" />
                    <label htmlFor="radio1" className="text-sm">Radio option</label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Layout Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Layout Elements</CardTitle>
              <CardDescription>
                Cards, alerts, and layout components
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-3">Alerts</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">Success alert message</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">Error alert message</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">Navigation</h4>
                <div className="flex gap-1 p-1 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 px-3 py-2 bg-background rounded-md shadow-sm">
                    <User className="w-4 h-4" />
                    <span className="text-sm">Profile</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">Calendar</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
                    <MessageSquare className="w-4 h-4" />
                    <span className="text-sm">Messages</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
                    <Settings className="w-4 h-4" />
                    <span className="text-sm">Settings</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">Badges</h4>
                <div className="flex gap-2">
                  <Badge variant="default">Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Full Width Layout Preview */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Application Layout Preview</CardTitle>
            <CardDescription>
              See how your theme looks in a real application context
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border border-border rounded-lg overflow-hidden">
              {/* Mock Header */}
              <div className="bg-card border-b border-border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-primary"></div>
                    <nav className="flex gap-6">
                      <a href="#" className="text-sm font-medium text-foreground">Dashboard</a>
                      <a href="#" className="text-sm text-muted-foreground">Projects</a>
                      <a href="#" className="text-sm text-muted-foreground">Team</a>
                    </nav>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">Sign out</Button>
                    <div className="w-8 h-8 rounded-full bg-secondary"></div>
                  </div>
                </div>
              </div>

              {/* Mock Content */}
              <div className="p-6">
                <div className="mb-6">
                  <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
                  <p className="text-muted-foreground">Welcome back! Here's what's happening today.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="text-2xl font-bold text-primary">124</div>
                    <div className="text-sm text-muted-foreground">Total Projects</div>
                  </div>
                  <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="text-2xl font-bold text-secondary">1,234</div>
                    <div className="text-sm text-muted-foreground">Active Users</div>
                  </div>
                  <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="text-2xl font-bold text-accent">98%</div>
                    <div className="text-sm text-muted-foreground">Success Rate</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="p-4 bg-card border border-border rounded-lg">
                    <h3 className="font-semibold mb-3">Recent Activity</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary"></div>
                        <div className="text-sm">New project created</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-secondary"></div>
                        <div className="text-sm">User invited to team</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-accent"></div>
                        <div className="text-sm">Report generated</div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-card border border-border rounded-lg">
                    <h3 className="font-semibold mb-3">Quick Actions</h3>
                    <div className="space-y-2">
                      <Button className="w-full justify-start" variant="ghost">
                        <User className="w-4 h-4 mr-2" />
                        Create User
                      </Button>
                      <Button className="w-full justify-start" variant="ghost">
                        <Calendar className="w-4 h-4 mr-2" />
                        Schedule Meeting
                      </Button>
                      <Button className="w-full justify-start" variant="ghost">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Send Message
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};