import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useContext } from 'react';
import AuthInteractionContext from '../context/AuthInteractionContext';

const CharacterGroup = () => {
    const { interactionState } = useContext(AuthInteractionContext);

    // Convert to MotionValues for high-performance updates without re-renders
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    useEffect(() => {
        const handleMouseMove = (e) => {
            const { innerWidth, innerHeight } = window;
            const x = (e.clientX / innerWidth) * 2 - 1;
            const y = (e.clientY / innerHeight) * 2 - 1;
            mouseX.set(x);
            mouseY.set(y);
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [mouseX, mouseY]);

    // Blinking logic
    const blinkVariant = {
        blink: {
            scaleY: [1, 0.1, 1],
            transition: { duration: 0.3, repeat: Infinity, repeatDelay: 4 }
        },
        peeking: {
            scaleY: 1
        },
        closed: {
            scaleY: 0.1
        },
        wide: {
            scaleY: 1.2,
            scaleX: 1.2
        }
    };

    // Body Motion Variants
    const bodyVariant = {
        idle: {
            y: [0, -10, 0],
            rotate: [0, 1, -1, 0],
            transition: { duration: 4, repeat: Infinity, ease: "easeInOut" }
        },
        email_focus: {
            rotate: 5,
            x: 20,
            y: 10,
            transition: { type: "spring", stiffness: 100 }
        },
        password_focus: {
            rotate: -5,
            transition: { type: "spring", stiffness: 80 }
        },
        typing: {
            y: [0, 3, 0],
            transition: { duration: 0.2, repeat: Infinity }
        },
        button_hover: {
            y: -20,
            scale: 1.05,
            transition: { type: "spring", bounce: 0.5 }
        },
        success: {
            y: -50,
            rotate: 360,
            transition: { duration: 0.8, ease: "backOut" }
        }
    };

    const getEyeVariant = (role) => {
        if (interactionState === 'password_focus') {
            return 'closed'; // All characters close eyes
        }
        if (interactionState === 'button_hover' || interactionState === 'success') {
            return 'wide';
        }
        return 'blink';
    };

    const getMouthType = (defaultMouth) => {
        if (interactionState === 'email_focus') return 'o'; // Interested
        if (interactionState === 'button_hover') return 'happy'; // Excited
        if (interactionState === 'success') return 'happy';
        if (interactionState === 'password_focus') return 'line'; // Serious
        return defaultMouth;
    };


    const CuteFace = ({ offsetX = 0, offsetY = 0, eyeDistance = 25, eyeSize = 10, pupilSize = 4, trackingRange = 6, hasCheeks = false, mouthType = "smile", role }) => {
        const isPassword = interactionState === 'password_focus';
        const isFocus = interactionState === 'email_focus' || interactionState === 'typing';

        // Pupil tracking using useTransform for 60fps performance
        const effectiveRange = isFocus ? trackingRange * 2 : trackingRange;

        // Conditional transform: if password & tall, lock eyes
        const pupilX = useTransform(mouseX, (x) => {
            if (isPassword && role === 'tall') return 0;
            return x * effectiveRange;
        });

        const pupilY = useTransform(mouseY, (y) => {
            if (isPassword && role === 'tall') return 10;
            return y * effectiveRange;
        });

        const eyeState = getEyeVariant(role);
        const currentMouth = getMouthType(mouthType);

        return (
            <g transform={`translate(${offsetX}, ${offsetY})`}>
                {hasCheeks && <g opacity={0.6}><circle cx={-(eyeDistance / 2) - 5} cy="8" r="5" fill="#f472b6" /><circle cx={(eyeDistance / 2) + 5} cy="8" r="5" fill="#f472b6" /></g>}

                {/* Eyes Container */}
                <g>
                    {/* Closed Eyes (Visible only when password focused) */}
                    <motion.g
                        initial={{ opacity: 0 }}
                        animate={{ opacity: isPassword ? 1 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* Left Closed Eye (Arc) */}
                        <path d={`M ${-eyeDistance / 2 - eyeSize} 0 Q ${-eyeDistance / 2} ${eyeSize} ${-eyeDistance / 2 + eyeSize} 0`} stroke="#1f2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                        {/* Right Closed Eye (Arc) */}
                        <path d={`M ${eyeDistance / 2 - eyeSize} 0 Q ${eyeDistance / 2} ${eyeSize} ${eyeDistance / 2 + eyeSize} 0`} stroke="#1f2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    </motion.g>

                    {/* Open Eyes (Hidden when password focused) */}
                    <motion.g
                        animate={{ opacity: isPassword ? 0 : 1 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* Left Eye */}
                        <motion.g variants={blinkVariant} animate={isPassword ? 'idle' : eyeState}> {/* Don't animate blink if hidden */}
                            <circle cx={-eyeDistance / 2} cy="0" r={eyeSize} fill="white" />
                            <motion.circle cx={-eyeDistance / 2} cy="0" r={pupilSize} fill="#1f2937" style={{ x: pupilX, y: pupilY }} />
                            <circle cx={-eyeDistance / 2 + 2} cy={-2} r={eyeSize / 4} fill="white" opacity="0.8" />
                        </motion.g>

                        {/* Right Eye */}
                        <motion.g variants={blinkVariant} animate={isPassword ? 'idle' : eyeState}>
                            <circle cx={eyeDistance / 2} cy="0" r={eyeSize} fill="white" />
                            <motion.circle cx={eyeDistance / 2} cy="0" r={pupilSize} fill="#1f2937" style={{ x: pupilX, y: pupilY }} />
                            <circle cx={eyeDistance / 2 + 2} cy={-2} r={eyeSize / 4} fill="white" opacity="0.8" />
                        </motion.g>
                    </motion.g>
                </g>



                <g transform="translate(0, 15)">
                    {currentMouth === "smile" && <path d="M -10 -5 Q 0 5 10 -5" stroke="#1f2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
                    {currentMouth === "o" && <circle cx="0" cy="0" r="4" stroke="#1f2937" strokeWidth="2" fill="none" />}
                    {currentMouth === "line" && <line x1="-5" y1="0" x2="5" y2="0" stroke="#1f2937" strokeWidth="2.5" strokeLinecap="round" />}
                    {currentMouth === "happy" && <path d="M -8 0 Q 0 10 8 0" stroke="#1f2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
                </g>
            </g>
        );
    };

    return (
        <div style={{ position: 'relative', width: '350px', height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

            <motion.div variants={bodyVariant} animate={interactionState === 'idle' ? 'idle' : interactionState} style={{ position: 'absolute', left: '40px', bottom: '60px', zIndex: 2 }}>
                <motion.svg width="90" height="200" viewBox="0 0 100 220">
                    <rect x="10" y="10" width="80" height="200" rx="40" fill="#10b981" />
                    <CuteFace offsetX="50" offsetY="70" eyeDistance={30} eyeSize={11} trackingRange={9} hasCheeks={true} mouthType="smile" role="tall" />
                </motion.svg>
            </motion.div>

            <motion.div variants={bodyVariant} animate={interactionState === 'idle' ? 'idle' : interactionState} transition={{ delay: 0.1 }} style={{ position: 'absolute', right: '50px', bottom: '90px', zIndex: 1 }}>
                <motion.svg width="60" height="160" viewBox="0 0 70 180">
                    <rect x="10" y="10" width="50" height="160" rx="25" fill="#334155" />
                    <CuteFace offsetX="35" offsetY="55" eyeDistance={18} eyeSize={8} trackingRange={6} mouthType="o" role="slim" />
                </motion.svg>
            </motion.div>

            <motion.div variants={bodyVariant} animate={interactionState === 'idle' ? 'idle' : interactionState} transition={{ delay: 0.2 }} style={{ position: 'absolute', left: '70px', bottom: '30px', zIndex: 3 }}>
                <motion.svg width="110" height="90" viewBox="0 0 120 100">
                    <path d="M 10 90 L 110 90 L 110 60 Q 110 10 60 10 Q 10 10 10 60 Z" fill="#d4af37" />
                    <CuteFace offsetX="60" offsetY="55" eyeDistance={32} eyeSize={12} trackingRange={10} hasCheeks={true} mouthType="smile" role="short" />
                </motion.svg>
            </motion.div>

            <motion.div variants={bodyVariant} animate={interactionState === 'idle' ? 'idle' : interactionState} transition={{ delay: 0.3 }} style={{ position: 'absolute', right: '70px', bottom: '20px', zIndex: 4 }}>
                <motion.svg width="120" height="120" viewBox="0 0 130 130">
                    <rect x="15" y="15" width="100" height="100" rx="30" fill="#059669" />
                    <CuteFace offsetX="65" offsetY="60" eyeDistance={36} eyeSize={12} trackingRange={8} hasCheeks={true} mouthType="line" role="block" />
                </motion.svg>
            </motion.div>
        </div>
    );
};

export default CharacterGroup;
