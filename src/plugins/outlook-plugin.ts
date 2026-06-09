// src/plugins/outlook-plugin.ts

export interface Rule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  enabled: boolean;
}

export interface RuleCondition {
  field: string;
  operator: string;
  value: string;
}

export interface RuleAction {
  type: string;
  parameters: Record<string, string>;
}

export class OutlookPlugin {
  private rules: Rule[] = [];

  constructor() {
    // Load existing rules from storage if available
  }

  addRule(rule: Rule): void {
    this.rules.push(rule);
    this.sortRulesByPriority();
    // Save rules to storage
  }

  updateRule(updatedRule: Rule): void {
    this.rules = this.rules.map(rule =>
      rule.id === updatedRule.id ? updatedRule : rule
    );
    this.sortRulesByPriority();
    // Save rules to storage
  }

  deleteRule(ruleId: string): void {
    this.rules = this.rules.filter(rule => rule.id !== ruleId);
    // Save rules to storage
  }

  enableRule(ruleId: string): void {
    this.rules = this.rules.map(rule =>
      rule.id === ruleId ? { ...rule, enabled: true } : rule
    );
    // Save rules to storage
  }

  disableRule(ruleId: string): void {
    this.rules = this.rules.map(rule =>
      rule.id === ruleId ? { ...rule, enabled: false } : rule
    );
    // Save rules to storage
  }

  async processEmail(email: any): Promise<void> {
    for (const rule of this.rules) {
      if (rule.enabled && this.evaluateConditions(email, rule.conditions)) {
        await this.executeActions(email, rule.actions);
        // Assuming priority 1 means "stop after first match" and lower numbers have higher priority
        if (rule.priority === 1) {
          break;
        }
      }
    }
  }

  private evaluateConditions(email: any, conditions: RuleCondition[]): boolean {
    // TODO: Implement logic to evaluate email against conditions
    // This will involve checking fields like sender, subject, body, etc.
    // based on the operators defined in RuleCondition.
    console.log("Evaluating conditions for email:", email);
    console.log("With conditions:", conditions);
    // Placeholder logic: always return true to allow action execution for now
    return true;
  }

  private async executeActions(email: any, actions: RuleAction[]): Promise<void> {
    // TODO: Implement logic to execute actions on the email
    // This will involve interacting with the Outlook API to perform actions
    // like moving emails, assigning categories, flagging, etc.
    console.log("Executing actions for email:", email);
    console.log("With actions:", actions);
    // Placeholder for actions
    for (const action of actions) {
      console.log(`Performing action: ${action.type} with parameters:`, action.parameters);
      // Example: if action.type is 'moveToFolder', use Outlook API to move the email
    }
  }

  private sortRulesByPriority(): void {
    this.rules.sort((a, b) => a.priority - b.priority);
    console.log("Rules sorted by priority.");
  }

  // TODO: Implement methods for saving and loading rules to/from persistent storage.
  // This will likely involve using Office.js context and potentially user settings.
}

// Initialization logic for the Outlook plugin would go here.
// This might involve bootstrapping the plugin using Office.js
// and making the OutlookPlugin instance available.
// Example:
// Office.onReady((info) => {
//   if (info.host === Office.HostType.Outlook) {
//     console.log("Outlook plugin initialized.");
//     const plugin = new OutlookPlugin();
//     // Example of adding a rule (would come from UI/settings)
//     plugin.addRule({
//       id: '1',
//       name: 'Move newsletters',
//       conditions: [{ field: 'sender', operator: 'contains', value: 'newsletter@example.com' }],
//       actions: [{ type: 'moveToFolder', parameters: { folderName: 'Newsletters' } }],
//       priority: 2,
//       enabled: true,
//     });
//     // Registering event handlers for new emails (e.g., using Office.context.mailbox.addHandlerAsync)
//   }
// });
