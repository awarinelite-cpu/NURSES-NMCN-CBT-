// src/components/ExplanationText.jsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { renderWithItalics } from '../utils/entranceExamParser';

function RichTextLine({ line, style }) {
  if (!line || line === '') {
    return <View style={styles.emptyLine} />;
  }

  const parts = renderWithItalics(line);

  if (typeof parts === 'string') {
    return <Text style={[styles.lineText, style]}>{parts}</Text>;
  }

  return (
    <Text style={[styles.lineText, style]}>
      {parts.map((part, i) => {
        if (typeof part === 'string') return part;
        switch (part.type) {
          case 'strong':
            return <Text key={part.key || i} style={styles.bold}>{part.content}</Text>;
          case 'em':
            return <Text key={part.key || i} style={styles.italic}>{part.content}</Text>;
          case 'u':
            return <Text key={part.key || i} style={styles.underline}>{part.content}</Text>;
          default:
            return part.content;
        }
      })}
    </Text>
  );
}

export default function ExplanationText({ text, style, textStyle }) {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split('\n');

  return (
    <View style={[styles.container, style]}>
      {lines.map((line, index) => (
        <RichTextLine key={index} line={line} style={textStyle} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  lineText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#E0E0E0',
  },
  emptyLine: {
    height: 10,
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
