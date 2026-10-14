# DotGrid MVP requirements

- Classic two-player Dots and Boxes on a 7 by 7 dot board (36 boxes arranged as a 6 by 6 grid).
- Players draw adjacent horizontal or vertical lines. Completing a box scores one point and retains the turn.
- A match ends after all 36 boxes are claimed. Equal scores are possible (for example, 18–18), so the game can end in a draw.
- When a match ends, each participant sees a short result animation tailored to their own outcome. The winner's device celebrates the win; the other player's device clearly shows the loss; a draw uses a neutral result treatment. Respect reduced-motion preferences.
- The production game will use Vatar/Lagos Life player identity and matchmaking. Every production match is between two real players using separate devices or browser sessions; the local turn-taking demo is development-only.
- Each turn has a server-enforced 30-second limit. A player who completes one or more boxes retains the turn and receives a fresh 30 seconds. Proposed reconnect grace period: 15 seconds.
- No purchases, cash prizes, gambling, or virtual currency are in the MVP.
- The user experience must be responsive, touch-friendly, and work in the Lagos Life frame.
