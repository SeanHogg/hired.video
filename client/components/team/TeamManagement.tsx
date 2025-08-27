import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  UserPlus, 
  Mail, 
  Shield, 
  Settings, 
  MoreHorizontal,
  Crown,
  Star,
  Briefcase,
  Search,
  Filter,
  Download,
  Upload
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { MyVideoResumeRole } from '@/types/account';

interface TeamMember {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: MyVideoResumeRole[];
  status: 'active' | 'pending' | 'inactive';
  joinedAt: Date;
  lastActive?: Date;
  avatar?: string;
}

interface InviteUserData {
  email: string;
  firstName: string;
  lastName: string;
  roles: MyVideoResumeRole[];
  message: string;
}

export function TeamManagement() {
  const [activeTab, setActiveTab] = useState('members');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<MyVideoResumeRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'inactive'>('all');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteData, setInviteData] = useState<InviteUserData>({
    email: '',
    firstName: '',
    lastName: '',
    roles: [],
    message: ''
  });

  useEffect(() => {
    loadTeamMembers();
  }, []);

  const loadTeamMembers = async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      const mockMembers: TeamMember[] = [
        {
          id: '1',
          userId: 'user1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@company.com',
          roles: [MyVideoResumeRole.AccountOwner],
          status: 'active',
          joinedAt: new Date('2024-01-15'),
          lastActive: new Date(),
          avatar: '/avatars/john.jpg'
        },
        {
          id: '2',
          userId: 'user2',
          firstName: 'Sarah',
          lastName: 'Johnson',
          email: 'sarah.johnson@company.com',
          roles: [MyVideoResumeRole.AccountAdmin],
          status: 'active',
          joinedAt: new Date('2024-02-01'),
          lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        },
        {
          id: '3',
          userId: 'user3',
          firstName: 'Mike',
          lastName: 'Davis',
          email: 'mike.davis@company.com',
          roles: [MyVideoResumeRole.Recruiter],
          status: 'active',
          joinedAt: new Date('2024-02-15'),
          lastActive: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        },
        {
          id: '4',
          userId: 'user4',
          firstName: 'Lisa',
          lastName: 'Wilson',
          email: 'lisa.wilson@company.com',
          roles: [MyVideoResumeRole.Recruiter],
          status: 'pending',
          joinedAt: new Date('2024-03-01'),
        }
      ];
      setTeamMembers(mockMembers);
    } catch (error) {
      console.error('Failed to load team members:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteUser = async () => {
    try {
      // TODO: Replace with actual API call
      console.log('Inviting user:', inviteData);
      
      // Mock success
      const newMember: TeamMember = {
        id: Date.now().toString(),
        userId: '',
        firstName: inviteData.firstName,
        lastName: inviteData.lastName,
        email: inviteData.email,
        roles: inviteData.roles,
        status: 'pending',
        joinedAt: new Date(),
      };
      
      setTeamMembers(prev => [...prev, newMember]);
      setShowInviteDialog(false);
      setInviteData({
        email: '',
        firstName: '',
        lastName: '',
        roles: [],
        message: ''
      });
    } catch (error) {
      console.error('Failed to invite user:', error);
    }
  };

  const handleUpdateUserRoles = async (userId: string, newRoles: MyVideoResumeRole[]) => {
    try {
      // TODO: Replace with actual API call
      console.log('Updating user roles:', userId, newRoles);
      
      setTeamMembers(prev => 
        prev.map(member => 
          member.userId === userId 
            ? { ...member, roles: newRoles }
            : member
        )
      );
    } catch (error) {
      console.error('Failed to update user roles:', error);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      // TODO: Replace with actual API call
      console.log('Removing user:', userId);
      
      setTeamMembers(prev => prev.filter(member => member.userId !== userId));
    } catch (error) {
      console.error('Failed to remove user:', error);
    }
  };

  const getRoleIcon = (role: MyVideoResumeRole) => {
    switch (role) {
      case MyVideoResumeRole.AccountOwner:
        return <Crown className="h-4 w-4" />;
      case MyVideoResumeRole.AccountAdmin:
        return <Star className="h-4 w-4" />;
      case MyVideoResumeRole.Recruiter:
        return <Briefcase className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getRoleName = (role: MyVideoResumeRole) => {
    switch (role) {
      case MyVideoResumeRole.AccountOwner:
        return 'Owner';
      case MyVideoResumeRole.AccountAdmin:
        return 'Admin';
      case MyVideoResumeRole.Recruiter:
        return 'Recruiter';
      default:
        return 'Member';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredMembers = teamMembers.filter(member => {
    const matchesSearch = 
      member.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || member.roles.includes(roleFilter);
    const matchesStatus = statusFilter === 'all' || member.status === statusFilter;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" />
            Team Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your team members, roles, and permissions
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Send an invitation to join your team
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={inviteData.firstName}
                      onChange={(e) => setInviteData(prev => ({ ...prev, firstName: e.target.value }))}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={inviteData.lastName}
                      onChange={(e) => setInviteData(prev => ({ ...prev, lastName: e.target.value }))}
                      placeholder="Smith"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={inviteData.email}
                    onChange={(e) => setInviteData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="john.smith@company.com"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Roles</Label>
                  <div className="flex flex-wrap gap-2">
                    {[MyVideoResumeRole.AccountAdmin, MyVideoResumeRole.Recruiter].map(role => (
                      <Button
                        key={role}
                        variant={inviteData.roles.includes(role) ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setInviteData(prev => ({
                            ...prev,
                            roles: prev.roles.includes(role)
                              ? prev.roles.filter(r => r !== role)
                              : [...prev.roles, role]
                          }));
                        }}
                      >
                        {getRoleIcon(role)}
                        <span className="ml-1">{getRoleName(role)}</span>
                      </Button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="message">Personal Message (Optional)</Label>
                  <Textarea
                    id="message"
                    value={inviteData.message}
                    onChange={(e) => setInviteData(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Welcome to our team!"
                    rows={3}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleInviteUser} disabled={!inviteData.email || inviteData.roles.length === 0}>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Invitation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="members">Team Members</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
          <TabsTrigger value="settings">Team Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4 items-center">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search team members..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as MyVideoResumeRole | 'all')}
                  className="px-3 py-2 border rounded-md"
                >
                  <option value="all">All Roles</option>
                  <option value={MyVideoResumeRole.AccountOwner}>Owner</option>
                  <option value={MyVideoResumeRole.AccountAdmin}>Admin</option>
                  <option value={MyVideoResumeRole.Recruiter}>Recruiter</option>
                </select>
                
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'pending' | 'inactive')}
                  className="px-3 py-2 border rounded-md"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Team Members List */}
          <Card>
            <CardHeader>
              <CardTitle>Team Members ({filteredMembers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading team members...</div>
              ) : filteredMembers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No team members found
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          {member.avatar ? (
                            <img src={member.avatar} alt={`${member.firstName} ${member.lastName}`} className="w-10 h-10 rounded-full" />
                          ) : (
                            <span className="text-sm font-medium">
                              {member.firstName[0]}{member.lastName[0]}
                            </span>
                          )}
                        </div>
                        
                        <div>
                          <div className="font-medium">
                            {member.firstName} {member.lastName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {member.email}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {member.roles.map((role, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {getRoleIcon(role)}
                                <span className="ml-1">{getRoleName(role)}</span>
                              </Badge>
                            ))}
                            <Badge className={`text-xs ${getStatusColor(member.status)}`}>
                              {member.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="text-right text-sm text-muted-foreground">
                          <div>Joined {member.joinedAt.toLocaleDateString()}</div>
                          {member.lastActive && (
                            <div>Last active {member.lastActive.toLocaleDateString()}</div>
                          )}
                        </div>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem>Edit Roles</DropdownMenuItem>
                            <DropdownMenuItem>Send Message</DropdownMenuItem>
                            <DropdownMenuItem>View Profile</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => handleRemoveUser(member.userId)}
                            >
                              Remove from Team
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Role and permission management will be implemented in the next phase.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Alert>
            <Settings className="h-4 w-4" />
            <AlertDescription>
              Team settings will be implemented in the next phase.
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>
    </div>
  );
}
