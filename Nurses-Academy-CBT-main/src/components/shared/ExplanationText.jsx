// src/components/ExplanationText.jsx
// ─────────────────────────────────────────────────────────────────────
// Renders explanation text with preserved line breaks and rich text.
// Use this instead of plain <Text> to display explanations.
// ─────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { renderWithItalics } from '../utils/entranceExamParser';

function RichTextLine({ line }) {
  if (!line) {
    return <Text style={styles.blankLine}>{' '}</Text>;
  }

  const parts = renderWithItalics(line);

  if (typeof parts === 'string') {
    return <Text style={styles.explanationLine}>{parts}</Text>;
  }

  return (
    <Text style={styles.explanationLine}>
      {parts.map((part, i) => {
        if (typeof part === 'string') {
          return <Text key={i}>{part}</Text>;
        }
        switch (part.type) {
          case 'strong':
            return <Text key={part.key || i} style={styles.bold}>{part.content}</Text>;
          case 'em':
            return <Text key={part.key || i} style={styles.italic}>{part.content}</Text>;
          case 'u':
            return <Text key={part.key || i} style={styles.underline}>{part.content}</Text>;
          default:
            return <Text key={part.key || i}>{part.content}</Text>;
        }
      })}
    </Text>
  );
}

export default function ExplanationText({ text, style }) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const lines = text.split('\n');

  return (
    <View style={[styles.container, style]}>
      {lines.map((line, index) => (
        <View key={index} style={styles.lineContainer}>
          <RichTextLine line={line} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  lineContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  explanationLine: {
    fontSize: 14,
    lineHeight: 20,
    color: '#E0E0E0',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  blankLine: {
    height: 12,
  },
  bold: {
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  italic: {
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
});
