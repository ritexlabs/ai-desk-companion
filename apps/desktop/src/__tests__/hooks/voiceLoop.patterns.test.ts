/**
 * Tests for the wake-word and sleep regex patterns used in useVoiceLoop.
 * Patterns are constructed here identically to the hook to test the logic
 * independently of React rendering.
 */
import { describe, expect, it } from 'vitest';

function makeWakePattern(wakeWord: string): RegExp {
  const name = wakeWord.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = `${name}t?`;
  return new RegExp(
    `wake[\\s\\-]?up[,\\s]*${n}|${n}[,\\s]+wake[\\s\\-]?up` +
    `|hey[,\\s]+${n}|hello[,\\s]+${n}`,
    'i',
  );
}

function makeSleepPattern(wakeWord: string): RegExp {
  const name = wakeWord.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = `${name}t?`;
  const sleepKw =
    `bye+|good[\\s\\-]?bye|good\\s?night|go\\s+(?:to\\s+)?sleep|go\\s+for\\s+sleep` +
    `|see\\s+you(?:\\s+(?:again|later|soon|tomorrow))?|shut\\s?down`;
  return new RegExp(
    `(?:${sleepKw}).*\\b${n}\\b|\\b${n}\\b.*(?:${sleepKw})` +
    `|^(?:(?:bye+\\s*)+|good[\\s\\-]?bye|good\\s?night|go\\s+(?:to\\s+)?sleep` +
    `|go\\s+for\\s+sleep|see\\s+you(?:\\s+(?:again|later|soon|tomorrow))?)\\s*[.!]*$`,
    'i',
  );
}

// ── Wake-word pattern ─────────────────────────────────────────────────────────

describe('wakeWordPattern (wakeWord = "robo")', () => {
  const pattern = makeWakePattern('robo');

  it.each([
    'Hey Robo',
    'Hello Robo',
    'hey robo',
    'hello robo',
    'HELLO ROBO',
    'HEY ROBO',
    'Robo wake-up',
    'robo wake up',
    'wake up robo',
    'Wake-up Robo',
    'Hey Robot',       // STT misrecognition "robo" → "robot" — should still match via t?
    'hello robot',
  ])('matches %s', (phrase) => {
    expect(pattern.test(phrase)).toBe(true);
  });

  it.each([
    'Robo',            // bare name alone — must not activate
    'Robot',           // bare misrecognition alone — must not activate
    'Hello World',
    'Hey there',
    'Good morning Robo',
    'Robo please',
  ])('does NOT match %s', (phrase) => {
    expect(pattern.test(phrase)).toBe(false);
  });
});

describe('wakeWordPattern with special chars in wake word', () => {
  it('strips non-alphanumeric from wake word before building pattern', () => {
    const pattern = makeWakePattern('R0b0!');
    expect(pattern.test('Hey R0b0')).toBe(true);
    expect(pattern.test('Hey r0b0')).toBe(true);
  });
});

// ── Sleep pattern ─────────────────────────────────────────────────────────────

describe('sleepPattern (wakeWord = "robo")', () => {
  const pattern = makeSleepPattern('robo');

  it.each([
    'Good night',
    'Goodnight',
    'good night',
    'Bye',
    'bye',
    'Byeee',
    'Goodbye',
    'goodbye',
    'Good-bye',
    'See you',
    'See you later',
    'See you soon',
    'See you tomorrow',
    'Go to sleep',
    'go to sleep',
    'go for sleep',
  ])('matches standalone farewell phrase: %s', (phrase) => {
    expect(pattern.test(phrase)).toBe(true);
  });

  it.each([
    'Bye Robo',
    'Goodnight Robo',
    'Good night robot',
    'see you later robo',
    'go to sleep robo',
  ])('matches farewell with wake word: %s', (phrase) => {
    expect(pattern.test(phrase)).toBe(true);
  });

  it.each([
    'Hello',
    'What time is it',
    'Weather in Mumbai',
    'Robo',
    'Good morning',
  ])('does NOT match normal utterance: %s', (phrase) => {
    expect(pattern.test(phrase)).toBe(false);
  });
});
