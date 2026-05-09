import React from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle
} from 'react-native';
import * as Haptics from 'expo-haptics';

const stats = [
  { label: 'Private first', value: 'Raw stays with the mediator' },
  { label: 'Preview ready', value: 'Approve before it enters the room' },
  { label: 'Resolution', value: 'Proposal v1 is waiting below' }
] as const;

const stages = [
  { label: 'Private draft', detail: 'Only you + mediator', state: 'done' },
  { label: 'Mediator preview', detail: 'Ready to approve', state: 'active' },
  { label: 'Shared room', detail: 'Jordan sees only the rewrite', state: 'upcoming' },
  { label: 'Plan', detail: 'Vote on one next step', state: 'upcoming' }
] as const;

const threadMessages = [
  {
    author: 'Mediator',
    time: '9:41',
    tone: 'mediator',
    text: 'Shared summary: You are asking for more notice before shared plans change, so the week feels collaborative instead of last-minute.'
  },
  {
    author: 'Jordan',
    time: '9:43',
    tone: 'other',
    text: 'That lands better. Work chaos is real on my side, but I can see how the current pattern makes you feel left out.'
  },
  {
    author: 'You',
    time: '9:44',
    tone: 'self',
    text: 'Yes. I want a simple rhythm that keeps both of us in the loop instead of replaying the same fight.'
  }
] as const;

const previewChecklist = [
  'Names the impact without blame.',
  'Turns the feeling into a clear request.',
  'Matches the room safety filter before send.'
] as const;

const proposalBullets = [
  'Hold a 15-minute check-in every Sunday evening.',
  'Give 48 hours notice before changes that affect both people.',
  'Send a same-day heads-up text when work makes that impossible.'
] as const;

const dockTabs = ['Inbox', 'Room', 'Plan'] as const;

const dockCopy: Record<(typeof dockTabs)[number], string> = {
  Inbox: 'Invites, nudges, and active rooms stay one swipe away from the live conversation.',
  Room: 'The shared thread stays centered while the mediator preview lives right inside the send flow.',
  Plan: 'Shared proposals stay docked to the conversation so both people can vote without context switching.'
};

const voteOptions = ['Yes', 'Needs edits', 'Pause'] as const;

type DockTab = (typeof dockTabs)[number];
type VoteOption = (typeof voteOptions)[number];
type FeedTone = (typeof threadMessages)[number]['tone'];
type PreviewTone = 'draft' | 'approved';

export default function App() {
  const [activeDock, setActiveDock] = React.useState<DockTab>('Room');
  const [selectedVote, setSelectedVote] = React.useState<VoteOption | null>(null);

  const handleSelection = (tab: DockTab) => {
    void Haptics.selectionAsync();
    setActiveDock(tab);
  };

  const handleVote = (vote: VoteOption) => {
    void Haptics.selectionAsync();
    setSelectedVote(vote);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View pointerEvents="none" style={styles.background}>
        <View style={[styles.glow, styles.glowBlue]} />
        <View style={[styles.glow, styles.glowPeach]} />
        <View style={[styles.glow, styles.glowSilver]} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.topBar}>
          <View style={styles.topCopy}>
            <Text style={styles.brand}>USMender</Text>
            <Text style={styles.topTitle}>A calmer thread for hard conversations.</Text>
          </View>

          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Mediator live</Text>
          </View>
        </View>

        <GlassCard style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.avatarStack}>
              <Avatar label="Y" tone="blue" />
              <Avatar label="M" tone="frost" style={styles.avatarMiddle} />
              <Avatar label="J" tone="teal" />
            </View>

            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>Active room</Text>
              <Text style={styles.heroTitle}>Kitchen tension</Text>
              <Text style={styles.heroBody}>
                Messaging first. You write privately, approve the mediator rewrite, and only the
                safer version reaches Jordan.
              </Text>
            </View>
          </View>

          <View style={styles.statRow}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statCard}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </GlassCard>

        <GlassCard style={styles.threadCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionEyebrow}>Shared thread</Text>
              <Text style={styles.sectionTitle}>The conversation everyone can see</Text>
            </View>
            <Text style={styles.sectionTag}>Phase 2 of 4</Text>
          </View>

          <View style={styles.stageRail}>
            {stages.map((stage) => (
              <View
                key={stage.label}
                style={[
                  styles.stageCard,
                  stage.state === 'done' && styles.stageCardDone,
                  stage.state === 'active' && styles.stageCardActive
                ]}
              >
                <Text
                  style={[
                    styles.stageLabel,
                    stage.state === 'active' && styles.stageLabelActive
                  ]}
                >
                  {stage.label}
                </Text>
                <Text style={styles.stageDetail}>{stage.detail}</Text>
              </View>
            ))}
          </View>

          <View style={styles.feed}>
            {threadMessages.map((message) => (
              <FeedMessage
                key={`${message.author}-${message.time}`}
                author={message.author}
                time={message.time}
                text={message.text}
                tone={message.tone}
              />
            ))}
          </View>

          <View style={styles.promptCard}>
            <Text style={styles.promptLabel}>Mediator prompt</Text>
            <Text style={styles.promptText}>
              What would more notice look like in a normal week, not just on the hardest day?
            </Text>
          </View>
        </GlassCard>

        <GlassCard style={styles.previewCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionEyebrow}>Message composer</Text>
              <Text style={styles.sectionTitle}>
                The mediator sits between your draft and send.
              </Text>
            </View>
            <Text style={styles.privateTag}>Only you + mediator</Text>
          </View>

          <Text style={styles.sectionBody}>
            This should feel like texting, not paperwork. You type naturally, the mediator shapes
            it inline, and you approve the exact version that enters the room.
          </Text>

          <View style={styles.draftField}>
            <Text style={styles.draftLabel}>Private draft</Text>
            <Text style={styles.draftText}>
              I keep getting blindsided when plans change and I feel like the last person to know.
            </Text>
          </View>

          <View style={styles.previewStack}>
            <PreviewPanel
              detail="Private"
              text="I keep getting blindsided when plans change and I feel like the last person to know."
              title="Raw version"
              tone="draft"
            />
            <PreviewPanel
              detail="Preview ready"
              text="I would like more notice before shared plans change so I can stay included and adjust with you."
              title="Mediator version"
              tone="approved"
            />
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>How this lands</Text>
              <Text style={styles.infoText}>
                A request for predictability and inclusion, not a criticism of intent.
              </Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Mediator note</Text>
              <Text style={styles.infoText}>
                Naming the future routine lowers heat and keeps the room moving toward a plan.
              </Text>
            </View>
          </View>

          <View style={styles.checklist}>
            {previewChecklist.map((item) => (
              <View key={item} style={styles.checkItem}>
                <View style={styles.checkBadge}>
                  <Text style={styles.checkGlyph}>+</Text>
                </View>
                <Text style={styles.checkText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.actionRow}>
            <ActionButton
              label="Edit draft"
              onPress={() => {
                void Haptics.selectionAsync();
              }}
              variant="secondary"
            />
            <ActionButton
              label="Approve & send"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              variant="primary"
            />
          </View>
        </GlassCard>

        <GlassCard style={styles.planCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionEyebrow}>Resolution draft</Text>
              <Text style={styles.sectionTitle}>A steadier cadence for shared decisions</Text>
            </View>
            <Text
              style={[styles.sectionTag, selectedVote !== null && styles.sectionTagSelected]}
            >
              {selectedVote === null ? 'Awaiting votes' : `Your vote: ${selectedVote}`}
            </Text>
          </View>

          <View style={styles.planList}>
            {proposalBullets.map((item) => (
              <View key={item} style={styles.planItem}>
                <View style={styles.planBullet} />
                <Text style={styles.planText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.voteRow}>
            {voteOptions.map((option) => (
              <VoteButton
                key={option}
                active={selectedVote === option}
                label={option}
                onPress={() => handleVote(option)}
              />
            ))}
          </View>
        </GlassCard>

        <GlassCard style={styles.footerCard}>
          <View style={styles.footerHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionEyebrow}>Safety rail</Text>
              <Text style={styles.footerTitle}>The room pauses before it harms.</Text>
            </View>
            <Text style={styles.safetyTag}>Filters on</Text>
          </View>

          <Text style={styles.footerCopy}>
            If the mediator detects coercion, threats, or escalation, the send flow pauses instead
            of forwarding the message.
          </Text>

          <View style={styles.tabBar}>
            {dockTabs.map((tab) => (
              <Pressable
                key={tab}
                onPress={() => handleSelection(tab)}
                style={({ pressed }) => [
                  styles.tabButton,
                  activeDock === tab && styles.tabButtonActive,
                  pressed && styles.buttonPressed
                ]}
              >
                <Text style={[styles.tabText, activeDock === tab && styles.tabTextActive]}>
                  {tab}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.tabCopy}>{dockCopy[activeDock]}</Text>
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function GlassCard({
  children,
  style
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.surface, style]}>
      <View pointerEvents="none" style={styles.surfaceSheen} />
      {children}
    </View>
  );
}

function Avatar({
  label,
  tone,
  style
}: {
  label: string;
  tone: 'blue' | 'frost' | 'teal';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.avatar,
        tone === 'blue' && styles.avatarBlue,
        tone === 'frost' && styles.avatarFrost,
        tone === 'teal' && styles.avatarTeal,
        style
      ]}
    >
      <Text style={styles.avatarText}>{label}</Text>
    </View>
  );
}

function FeedMessage({
  author,
  text,
  time,
  tone
}: {
  author: string;
  text: string;
  time: string;
  tone: FeedTone;
}) {
  const bubbleStyle =
    tone === 'self'
      ? styles.feedBubbleSelf
      : tone === 'other'
        ? styles.feedBubbleOther
        : styles.feedBubbleMediator;

  return (
    <View
      style={[
        styles.feedItem,
        tone === 'self' && styles.feedItemSelf,
        tone === 'mediator' && styles.feedItemMediator
      ]}
    >
      <Text style={[styles.feedAuthor, tone === 'self' && styles.feedAuthorSelf]}>{author}</Text>
      <View style={[styles.feedBubble, bubbleStyle]}>
        {tone === 'mediator' && <Text style={styles.inlineBadge}>Mediator summary</Text>}
        <Text style={styles.feedText}>{text}</Text>
      </View>
      <Text style={[styles.feedTime, tone === 'self' && styles.feedTimeSelf]}>{time}</Text>
    </View>
  );
}

function PreviewPanel({
  detail,
  text,
  title,
  tone
}: {
  detail: string;
  text: string;
  title: string;
  tone: PreviewTone;
}) {
  return (
    <View
      style={[
        styles.previewPanel,
        tone === 'draft' ? styles.previewPanelDraft : styles.previewPanelApproved
      ]}
    >
      <View style={styles.previewHeader}>
        <Text style={styles.previewTitle}>{title}</Text>
        <Text
          style={[
            styles.previewDetail,
            tone === 'approved' && styles.previewDetailApproved
          ]}
        >
          {detail}
        </Text>
      </View>
      <Text style={styles.previewText}>{text}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  variant
}: {
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        variant === 'primary' ? styles.actionButtonPrimary : styles.actionButtonSecondary,
        pressed && styles.buttonPressed
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === 'primary'
            ? styles.actionButtonTextPrimary
            : styles.actionButtonTextSecondary
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function VoteButton({
  active,
  label,
  onPress
}: {
  active: boolean;
  label: VoteOption;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.voteButton,
        active && styles.voteButtonActive,
        pressed && styles.buttonPressed
      ]}
    >
      <Text style={[styles.voteText, active && styles.voteTextActive]}>{label}</Text>
    </Pressable>
  );
}

const colors = {
  background: '#08111f',
  surface: 'rgba(246, 248, 255, 0.12)',
  surfaceStrong: 'rgba(255, 255, 255, 0.16)',
  surfaceMuted: 'rgba(255, 255, 255, 0.09)',
  border: 'rgba(255, 255, 255, 0.2)',
  borderStrong: 'rgba(255, 255, 255, 0.34)',
  text: '#f5f8ff',
  textSoft: 'rgba(237, 243, 255, 0.78)',
  textMuted: 'rgba(224, 232, 247, 0.56)',
  accent: '#88a9ff',
  accentStrong: '#5d80ff',
  accentSoft: 'rgba(136, 169, 255, 0.2)',
  tealSoft: 'rgba(151, 229, 216, 0.18)',
  warmSoft: 'rgba(255, 194, 139, 0.18)',
  success: '#c8f3e8',
  shadow: '#02060d'
};

const shadow = {
  shadowColor: colors.shadow,
  shadowOpacity: 0.36,
  shadowRadius: 26,
  shadowOffset: { width: 0, height: 18 },
  elevation: 10
};

const textReset: TextStyle = {
  includeFontPadding: false
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden'
  },
  glow: {
    position: 'absolute',
    borderRadius: 999
  },
  glowBlue: {
    top: -120,
    right: -80,
    width: 340,
    height: 340,
    backgroundColor: 'rgba(100, 143, 255, 0.26)'
  },
  glowPeach: {
    top: 280,
    left: -120,
    width: 280,
    height: 280,
    backgroundColor: 'rgba(255, 184, 129, 0.18)'
  },
  glowSilver: {
    bottom: -120,
    right: -100,
    width: 300,
    height: 300,
    backgroundColor: 'rgba(255, 255, 255, 0.09)'
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  topCopy: {
    flex: 1,
    gap: 6
  },
  brand: {
    ...textReset,
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  topTitle: {
    ...textReset,
    color: colors.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700'
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success
  },
  liveText: {
    ...textReset,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600'
  },
  surface: {
    ...shadow,
    position: 'relative',
    borderRadius: 30,
    padding: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  surfaceSheen: {
    position: 'absolute',
    top: 12,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.24)'
  },
  heroCard: {
    marginTop: 4,
    paddingTop: 22,
    gap: 18
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  avatarStack: {
    width: 88,
    height: 64,
    justifyContent: 'center'
  },
  avatar: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong
  },
  avatarBlue: {
    left: 0,
    backgroundColor: colors.accentSoft
  },
  avatarMiddle: {
    left: 18
  },
  avatarFrost: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)'
  },
  avatarTeal: {
    left: 36,
    backgroundColor: colors.tealSoft
  },
  avatarText: {
    ...textReset,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  heroCopy: {
    flex: 1,
    gap: 6
  },
  eyebrow: {
    ...textReset,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase'
  },
  heroTitle: {
    ...textReset,
    color: colors.text,
    fontSize: 25,
    lineHeight: 28,
    fontWeight: '700'
  },
  heroBody: {
    ...textReset,
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 21
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    gap: 6
  },
  statValue: {
    ...textReset,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  statLabel: {
    ...textReset,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3
  },
  threadCard: {
    marginTop: -4,
    gap: 16
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14
  },
  sectionCopy: {
    flex: 1,
    gap: 6
  },
  sectionEyebrow: {
    ...textReset,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  sectionTitle: {
    ...textReset,
    color: colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700'
  },
  sectionTag: {
    ...textReset,
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceStrong
  },
  sectionTagSelected: {
    color: colors.text,
    backgroundColor: 'rgba(136, 169, 255, 0.26)'
  },
  stageRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  stageCard: {
    width: '48%',
    minWidth: 140,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 4
  },
  stageCardDone: {
    backgroundColor: 'rgba(151, 229, 216, 0.14)',
    borderColor: 'rgba(151, 229, 216, 0.2)'
  },
  stageCardActive: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.borderStrong
  },
  stageLabel: {
    ...textReset,
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600'
  },
  stageLabelActive: {
    color: colors.text
  },
  stageDetail: {
    ...textReset,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15
  },
  feed: {
    gap: 12
  },
  feedItem: {
    width: '100%',
    gap: 6
  },
  feedItemSelf: {
    alignItems: 'flex-end'
  },
  feedItemMediator: {
    alignItems: 'center'
  },
  feedAuthor: {
    ...textReset,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  },
  feedAuthorSelf: {
    textAlign: 'right'
  },
  feedBubble: {
    maxWidth: '88%',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1
  },
  feedBubbleSelf: {
    backgroundColor: colors.accentSoft,
    borderColor: 'rgba(136, 169, 255, 0.22)'
  },
  feedBubbleOther: {
    backgroundColor: colors.tealSoft,
    borderColor: 'rgba(151, 229, 216, 0.2)'
  },
  feedBubbleMediator: {
    maxWidth: '92%',
    backgroundColor: colors.surfaceStrong,
    borderColor: 'rgba(255, 255, 255, 0.12)'
  },
  inlineBadge: {
    ...textReset,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 8
  },
  feedText: {
    ...textReset,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21
  },
  feedTime: {
    ...textReset,
    color: colors.textMuted,
    fontSize: 11
  },
  feedTimeSelf: {
    textAlign: 'right'
  },
  promptCard: {
    padding: 14,
    borderRadius: 22,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 6
  },
  promptLabel: {
    ...textReset,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  promptText: {
    ...textReset,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  previewCard: {
    marginTop: -6,
    gap: 16
  },
  privateTag: {
    ...textReset,
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.accentSoft
  },
  sectionBody: {
    ...textReset,
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 21
  },
  draftField: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 8
  },
  draftLabel: {
    ...textReset,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  draftText: {
    ...textReset,
    color: colors.text,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '500'
  },
  previewStack: {
    gap: 12
  },
  previewPanel: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    gap: 10
  },
  previewPanelDraft: {
    backgroundColor: colors.warmSoft,
    borderColor: 'rgba(255, 194, 139, 0.2)'
  },
  previewPanelApproved: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.borderStrong
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10
  },
  previewTitle: {
    ...textReset,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  previewDetail: {
    ...textReset,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.1)'
  },
  previewDetailApproved: {
    color: colors.text,
    backgroundColor: colors.accentSoft
  },
  previewText: {
    ...textReset,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22
  },
  infoGrid: {
    gap: 10
  },
  infoCard: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 6
  },
  infoLabel: {
    ...textReset,
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  infoText: {
    ...textReset,
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19
  },
  checklist: {
    gap: 10
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(151, 229, 216, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(151, 229, 216, 0.24)'
  },
  checkGlyph: {
    ...textReset,
    color: colors.success,
    fontSize: 14,
    fontWeight: '700'
  },
  checkText: {
    ...textReset,
    flex: 1,
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 16,
    borderWidth: 1
  },
  actionButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: 'rgba(173, 194, 255, 0.36)'
  },
  actionButtonSecondary: {
    backgroundColor: colors.surfaceStrong,
    borderColor: 'rgba(255, 255, 255, 0.12)'
  },
  actionButtonText: {
    ...textReset,
    fontSize: 14,
    fontWeight: '700'
  },
  actionButtonTextPrimary: {
    color: '#11214a'
  },
  actionButtonTextSecondary: {
    color: colors.text
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }]
  },
  planCard: {
    marginTop: -6,
    gap: 14
  },
  planList: {
    gap: 12
  },
  planItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  planBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
    backgroundColor: colors.accent
  },
  planText: {
    ...textReset,
    flex: 1,
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20
  },
  voteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  voteButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)'
  },
  voteButtonActive: {
    backgroundColor: colors.accentSoft,
    borderColor: 'rgba(136, 169, 255, 0.34)'
  },
  voteText: {
    ...textReset,
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700'
  },
  voteTextActive: {
    color: colors.text
  },
  footerCard: {
    marginTop: -6,
    gap: 14
  },
  footerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  footerTitle: {
    ...textReset,
    color: colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700'
  },
  safetyTag: {
    ...textReset,
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceStrong
  },
  footerCopy: {
    ...textReset,
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  tabButtonActive: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.borderStrong
  },
  tabText: {
    ...textReset,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700'
  },
  tabTextActive: {
    color: colors.text
  },
  tabCopy: {
    ...textReset,
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19
  }
});
