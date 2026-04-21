/**
 * Utility functions for UI components
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with proper precedence
 * 合并Tailwind类名，处理冲突并确保正确的优先级
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as a string with commas
 * 格式化数字，添加千位分隔符
 */
export function formatNumber(num: number): string {
  return num.toLocaleString("zh-CN");
}

/**
 * Truncate a string to a maximum length
 * 截断字符串到最大长度
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

/**
 * Wait for a specified duration
 * 等待指定时间
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique ID
 * 生成唯一ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}
