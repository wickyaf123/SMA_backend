/**
 * Schedule Templates
 * Pre-built cron job schedule configurations for different use cases
 * Users can select a template or create custom schedules
 */

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  targetLeads: number;
  schedules: {
    shovelsJobCron: string;
    enrichJobCron: string;
    mergeJobCron: string;
    validateJobCron: string;
    enrollJobCron: string;
  };
  estimatedCosts: {
    shovels: string;
  };
}

export const SCHEDULE_TEMPLATES: Record<string, ScheduleTemplate> = {
  // ⚖️ BALANCED - 100 leads/day, runs twice daily
  balanced: {
    id: 'balanced',
    name: 'Balanced (100 leads/day)',
    description: 'Twice daily runs - morning & evening. Good balance of volume and API costs.',
    icon: '⚖️',
    targetLeads: 100,
    schedules: {
      shovelsJobCron: '0 6 * * *',     // 6:00 AM
      enrichJobCron: '0 8 * * *',      // 8:00 AM
      mergeJobCron: '0 9 * * *',       // 9:00 AM
      validateJobCron: '0 10 * * *',   // 10:00 AM
      enrollJobCron: '0 11 * * *',     // 11:00 AM
    },
    estimatedCosts: {
      shovels: '~$0.50/day',
    },
  },

  // 🚀 AGGRESSIVE - 200+ leads/day, runs 3x daily
  aggressive: {
    id: 'aggressive',
    name: 'Aggressive (200+ leads/day)',
    description: 'Three runs per day. Maximum lead generation, higher API usage.',
    icon: '🚀',
    targetLeads: 200,
    schedules: {
      shovelsJobCron: '0 6,14,22 * * *',     // 6 AM, 2 PM, 10 PM
      enrichJobCron: '0 8,16,23 * * *',     // 8 AM, 4 PM, 11 PM
      mergeJobCron: '30 8,16,23 * * *',     // 8:30 AM, 4:30 PM, 11:30 PM
      validateJobCron: '0 9,17 * * *',      // 9 AM, 5 PM
      enrollJobCron: '30 9,17 * * *',       // 9:30 AM, 5:30 PM
    },
    estimatedCosts: {
      shovels: '~$1.50/day',
    },
  },

  // 🐢 CONSERVATIVE - 50 leads/day, runs once daily
  conservative: {
    id: 'conservative',
    name: 'Conservative (50 leads/day)',
    description: 'Single daily run at night. Lower costs, steady growth.',
    icon: '🐢',
    targetLeads: 50,
    schedules: {
      shovelsJobCron: '0 2 * * *',       // 2:00 AM
      enrichJobCron: '0 3 * * *',       // 3:00 AM
      mergeJobCron: '0 4 * * *',        // 4:00 AM
      validateJobCron: '0 5 * * *',     // 5:00 AM
      enrollJobCron: '0 6 * * *',       // 6:00 AM
    },
    estimatedCosts: {
      shovels: '~$0.25/day',
    },
  },

  // 📅 WEEKDAYS ONLY - Business hours focus
  weekdays: {
    id: 'weekdays',
    name: 'Weekdays Only',
    description: 'Runs Monday-Friday during business prep hours. No weekend processing.',
    icon: '📅',
    targetLeads: 70,
    schedules: {
      shovelsJobCron: '0 6 * * 1-5',     // 6 AM Mon-Fri
      enrichJobCron: '0 8 * * 1-5',     // 8 AM Mon-Fri
      mergeJobCron: '0 9 * * 1-5',      // 9 AM Mon-Fri
      validateJobCron: '0 10 * * 1-5',  // 10 AM Mon-Fri
      enrollJobCron: '0 11 * * 1-5',    // 11 AM Mon-Fri
    },
    estimatedCosts: {
      shovels: '~$0.35/day',
    },
  },

  // 🌙 NIGHT OWL - All processing at night
  nightOwl: {
    id: 'nightOwl',
    name: 'Night Owl',
    description: 'All jobs run overnight. Fresh leads ready by morning.',
    icon: '🌙',
    targetLeads: 100,
    schedules: {
      shovelsJobCron: '0 0 * * *',       // Midnight
      enrichJobCron: '0 2 * * *',       // 2 AM
      mergeJobCron: '0 3 * * *',        // 3 AM
      validateJobCron: '0 4 * * *',     // 4 AM
      enrollJobCron: '0 5 * * *',       // 5 AM
    },
    estimatedCosts: {
      shovels: '~$0.50/day',
    },
  },

  // ⚡ REAL-TIME - Continuous throughout the day
  realtime: {
    id: 'realtime',
    name: 'Real-Time Pipeline',
    description: 'Runs every 4 hours. Continuous lead flow throughout the day.',
    icon: '⚡',
    targetLeads: 150,
    schedules: {
      shovelsJobCron: '0 */4 * * *',           // Every 4 hours
      enrichJobCron: '0 1,5,9,13,17,21 * * *',
      mergeJobCron: '30 1,5,9,13,17,21 * * *',
      validateJobCron: '0 2,6,10,14,18,22 * * *',
      enrollJobCron: '0 3,7,11,15,19,23 * * *',
    },
    estimatedCosts: {
      shovels: '~$1.00/day',
    },
  },
};

/**
 * Get a schedule template by ID
 */
export function getScheduleTemplate(templateId: string): ScheduleTemplate | undefined {
  return SCHEDULE_TEMPLATES[templateId];
}

/**
 * Get all available schedule templates
 */
export function getAllScheduleTemplates(): ScheduleTemplate[] {
  return Object.values(SCHEDULE_TEMPLATES);
}

/**
 * Convert a cron expression to human-readable format
 */
export function cronToHuman(cronExpression: string): string {
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) return cronExpression;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Handle common patterns
  if (dayOfMonth === '*' && month === '*') {
    // Daily or specific days
    const dayStr = dayOfWeek === '*' 
      ? 'Every day'
      : dayOfWeek === '1-5' 
        ? 'Mon-Fri'
        : dayOfWeek === '0' 
          ? 'Sundays'
          : `Day ${dayOfWeek}`;

    // Handle multiple hours
    if (hour.includes(',')) {
      const hours = hour.split(',').map(h => formatHour(parseInt(h), parseInt(minute)));
      return `${dayStr} at ${hours.join(', ')}`;
    }

    // Handle interval hours
    if (hour.includes('/')) {
      const interval = hour.split('/')[1];
      return `Every ${interval} hours`;
    }

    return `${dayStr} at ${formatHour(parseInt(hour), parseInt(minute))}`;
  }

  return cronExpression;
}

/**
 * Format hour and minute to readable time
 */
function formatHour(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const displayMinute = minute.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
}

/**
 * Validate a cron expression
 */
export function isValidCron(cronExpression: string): boolean {
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) return false;

  const patterns = [
    /^(\*|([0-5]?\d)(,([0-5]?\d))*|(\*\/\d+))$/,           // Minute
    /^(\*|([01]?\d|2[0-3])(,([01]?\d|2[0-3]))*|(\*\/\d+))$/, // Hour
    /^(\*|([1-9]|[12]\d|3[01])(,([1-9]|[12]\d|3[01]))*|(\*\/\d+))$/, // Day of month
    /^(\*|([1-9]|1[0-2])(,([1-9]|1[0-2]))*|(\*\/\d+))$/,   // Month
    /^(\*|[0-6](,[0-6])*|[0-6]-[0-6]|(\*\/\d+))$/,         // Day of week
  ];

  return parts.every((part, index) => patterns[index].test(part));
}

