import React, { useState, useEffect, useRef } from 'react';
import { Zap, TrendingUp, Users, Trophy, Settings, DollarSign } from 'lucide-react';

// Google Sheets Configuration
const SHEETS_CONFIG = {
  scriptUrl: 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE',
  // After deploying the Apps Script (I'll provide separately), paste the URL here
};

const OrionSurge = () => {
  const [gameState, setGameState] = useState('BETTING'); // BETTING, PLAYING, CRASHED, RESULTS
  const [multiplier, setMultiplier] = useState(1.00);
  const [countdown, setCountdown] = useState(6);
  const [crashPoint, setCrashPoint] = useState(null);
  const [roundId, setRoundId] = useState(1);
  
  // User state
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [balance, setBalance] = useState(1000);
  const [userId, setUserId] = useState(null);
  
  // Betting state
  const [betAmount1, setBetAmount1] = useState(100);
  const [betAmount2, setBetAmount2] = useState(40);
  const [activeBet1, setActiveBet1] = useState(null);
  const [activeBet2, setActiveBet2] = useState(null);
  const [autoCashout1, setAutoCashout1] = useState(null);
  const [autoCashout2, setAutoCashout2] = useState(null);
  
  // Game stats
  const [recentCrashes, setRecentCrashes] = useState([]);
  const [activePlayers, setActivePlayers] = useState([]);
  const [totalWagered, setTotalWagered] = useState(0);
  const [houseProfit, setHouseProfit] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  
  // Refs
  const gameLoopRef = useRef(null);
  const startTimeRef = useRef(null);
  const audioRef = useRef({
    enabled: true,
    volume: 0.5
  });

  // Generate provably fair crash point
  const generateCrashPoint = (roundSeed) => {
    const random = Math.random();
    // Exponential distribution: most crashes between 1.05-3x, rare high multipliers
    const e = 0.99; // House edge
    const result = Math.floor((100 * e) / (1 - random)) / 100;
    
    // Ensure within bounds (1.05 - 100.00)
    const crash = Math.max(1.05, Math.min(100.00, result));
    return Math.round(crash * 100) / 100;
  };

  // Play sound effect
  const playSound = (type) => {
    if (!audioRef.current.enabled) return;
    // In production, you'd load actual audio files
    const sounds = {
      bet: '🔊',
      cashout: '💰',
      crash: '💥',
      countdown: '⏱️'
    };
    console.log(`Sound: ${sounds[type]}`);
  };

  // Login system
  const handleLogin = () => {
    if (username.trim()) {
      const newUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setUserId(newUserId);
      setIsLoggedIn(true);
      
      // In production, this would call Google Sheets to check/create user
      console.log('User logged in:', username, newUserId);
      
      // TODO: Call Apps Script to register/load user
      // fetch(SHEETS_CONFIG.scriptUrl + '?action=login', {...})
    }
  };

  // Place bet
  const placeBet = (slot) => {
    if (gameState !== 'BETTING') return;
    
    const amount = slot === 1 ? betAmount1 : betAmount2;
    
    if (amount < 40) {
      alert('Minimum bet is 40 tokens!');
      return;
    }
    
    if (amount > 2000) {
      alert('Maximum bet is 2000 tokens!');
      return;
    }
    
    if (amount > balance) {
      alert('Insufficient balance!');
      return;
    }
    
    setBalance(prev => prev - amount);
    
    if (slot === 1) {
      setActiveBet1({ amount, placed: true, cashedOut: false });
    } else {
      setActiveBet2({ amount, placed: true, cashedOut: false });
    }
    
    playSound('bet');
    
    // TODO: Send bet to Google Sheets
    console.log(`Bet placed: Slot ${slot}, Amount: ${amount}`);
  };

  // Cash out
  const cashOut = (slot) => {
    if (gameState !== 'PLAYING') return;
    
    const bet = slot === 1 ? activeBet1 : activeBet2;
    if (!bet || bet.cashedOut) return;
    
    const winAmount = Math.floor(bet.amount * multiplier);
    setBalance(prev => prev + winAmount);
    
    if (slot === 1) {
      setActiveBet1(prev => ({ ...prev, cashedOut: true, cashoutMultiplier: multiplier, winAmount }));
    } else {
      setActiveBet2(prev => ({ ...prev, cashedOut: true, cashoutMultiplier: multiplier, winAmount }));
    }
    
    playSound('cashout');
    
    // TODO: Send cashout to Google Sheets
    console.log(`Cashed out: ${winAmount} tokens at ${multiplier}x`);
  };

  // Auto cashout check
  useEffect(() => {
    if (gameState === 'PLAYING') {
      // Check auto cashout for slot 1
      if (activeBet1 && !activeBet1.cashedOut && autoCashout1 && multiplier >= autoCashout1) {
        cashOut(1);
      }
      
      // Check auto cashout for slot 2
      if (activeBet2 && !activeBet2.cashedOut && autoCashout2 && multiplier >= autoCashout2) {
        cashOut(2);
      }
    }
  }, [multiplier, gameState]);

  // Main game loop
  useEffect(() => {
    const runGameLoop = () => {
      // BETTING PHASE (6 seconds)
      if (gameState === 'BETTING') {
        const countdownInterval = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              // Start round
              const newCrashPoint = generateCrashPoint(roundId);
              setCrashPoint(newCrashPoint);
              setGameState('PLAYING');
              setMultiplier(1.00);
              startTimeRef.current = Date.now();
              playSound('countdown');
              return 6;
            }
            return prev - 1;
          });
        }, 1000);
        
        return () => clearInterval(countdownInterval);
      }
      
      // PLAYING PHASE
      if (gameState === 'PLAYING') {
        const playInterval = setInterval(() => {
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          // Exponential growth curve
          const newMultiplier = Math.pow(1.1, elapsed * 2);
          const roundedMultiplier = Math.round(newMultiplier * 100) / 100;
          
          setMultiplier(roundedMultiplier);
          
          // Check if crashed
          if (roundedMultiplier >= crashPoint || roundedMultiplier >= 300) {
            clearInterval(playInterval);
            setGameState('CRASHED');
            playSound('crash');
            
            // Process losses for uncashed bets
            let houseTake = 0;
            if (activeBet1 && !activeBet1.cashedOut) {
              houseTake += activeBet1.amount;
            }
            if (activeBet2 && !activeBet2.cashedOut) {
              houseTake += activeBet2.amount;
            }
            
            setHouseProfit(prev => prev + houseTake);
            
            // TODO: Send crash results to Google Sheets
            console.log(`Round ${roundId} crashed at ${crashPoint}x, House profit: ${houseTake}`);
            
            // Show results briefly
            setTimeout(() => {
              setGameState('RESULTS');
              setRecentCrashes(prev => [crashPoint, ...prev.slice(0, 19)]);
              
              // Reset for next round
              setTimeout(() => {
                setActiveBet1(null);
                setActiveBet2(null);
                setRoundId(prev => prev + 1);
                setCountdown(6);
                setGameState('BETTING');
              }, 2000);
            }, 1000);
          }
        }, 50); // 50ms updates for smooth animation
        
        return () => clearInterval(playInterval);
      }
    };
    
    gameLoopRef.current = runGameLoop();
    return () => {
      if (gameLoopRef.current) {
        gameLoopRef.current();
      }
    };
  }, [gameState, roundId, crashPoint]);

  // Login Screen
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/50 backdrop-blur-xl border-2 border-blue-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-block relative mb-4">
              <Zap className="w-24 h-24 text-cyan-400 drop-shadow-[0_0_25px_rgba(34,211,238,0.8)] animate-pulse" />
              <div className="absolute inset-0 bg-cyan-400/20 blur-3xl rounded-full"></div>
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">
              ORION SURGE
            </h1>
            <p className="text-cyan-400 text-sm font-semibold tracking-wider">AI AMPLIFIES. I CREATE.</p>
          </div>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full px-4 py-3 bg-slate-900/50 border border-blue-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />
            
            <button
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg shadow-cyan-500/50"
            >
              START PLAYING
            </button>
            
            <p className="text-xs text-slate-400 text-center mt-4">
              Starting balance: 1,000 tokens 🪙
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main Game Screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900/80 backdrop-blur-sm border-b border-blue-500/30 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="w-8 h-8 text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]" />
            <div>
              <h1 className="text-xl font-bold">ORION SURGE</h1>
              <p className="text-xs text-slate-400">Round #{roundId}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-slate-400">Balance</p>
              <p className="text-lg font-bold text-yellow-400">{balance.toFixed(2)} 🪙</p>
            </div>
            
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Crashes */}
      <div className="bg-slate-800/30 backdrop-blur-sm px-4 py-2 border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto">
          <TrendingUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div className="flex gap-2">
            {recentCrashes.length === 0 ? (
              <span className="text-xs text-slate-500">No history yet...</span>
            ) : (
              recentCrashes.map((crash, idx) => (
                <span
                  key={idx}
                  className={`text-xs font-bold px-2 py-1 rounded ${
                    crash < 2 ? 'bg-red-500/20 text-red-400' :
                    crash < 10 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-green-500/20 text-green-400'
                  }`}
                >
                  {crash.toFixed(2)}x
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Game Area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Game Display */}
          <div className="bg-slate-800/50 backdrop-blur-xl border-2 border-blue-500/30 rounded-2xl p-6 relative overflow-hidden min-h-[500px] flex flex-col items-center justify-center">
            {/* Background Grid Animation */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(59, 130, 246, .3) 25%, rgba(59, 130, 246, .3) 26%, transparent 27%, transparent 74%, rgba(59, 130, 246, .3) 75%, rgba(59, 130, 246, .3) 76%, transparent 77%), linear-gradient(90deg, transparent 24%, rgba(59, 130, 246, .3) 25%, rgba(59, 130, 246, .3) 26%, transparent 27%, transparent 74%, rgba(59, 130, 246, .3) 75%, rgba(59, 130, 246, .3) 76%, transparent 77%)',
                backgroundSize: '50px 50px'
              }}></div>
            </div>

            {/* Game State Display */}
            {gameState === 'BETTING' && (
              <div className="text-center z-10">
                <div className="mb-6">
                  <Zap className="w-32 h-32 text-cyan-400 mx-auto drop-shadow-[0_0_30px_rgba(34,211,238,0.8)] animate-pulse" />
                </div>
                <h2 className="text-5xl font-bold text-cyan-400 mb-4 animate-pulse">
                  PLACE YOUR BETS
                </h2>
                <div className="text-8xl font-bold text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]">
                  {countdown}
                </div>
                <p className="text-slate-400 mt-4">Next round starting...</p>
              </div>
            )}

            {(gameState === 'PLAYING' || gameState === 'CRASHED' || gameState === 'RESULTS') && (
              <div className="text-center z-10 relative">
                {/* Lightning Bolt Animation */}
                <div className="relative mb-8">
                  <Zap 
                    className={`w-48 h-48 mx-auto transition-all duration-300 ${
                      gameState === 'CRASHED' ? 'text-red-500 animate-ping' : 'text-cyan-400'
                    }`}
                    style={{
                      filter: `drop-shadow(0 0 ${Math.min(multiplier * 5, 50)}px rgba(34,211,238,0.8))`,
                      transform: `scale(${Math.min(1 + (multiplier - 1) * 0.1, 2)})`
                    }}
                  />
                  
                  {/* Electrical particles */}
                  {gameState === 'PLAYING' && multiplier > 5 && (
                    <div className="absolute inset-0">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute w-2 h-2 bg-cyan-400 rounded-full animate-ping"
                          style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            animationDelay: `${i * 0.2}s`
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Multiplier Display */}
                <div 
                  className={`text-9xl font-bold mb-4 transition-all duration-200 ${
                    gameState === 'CRASHED' ? 'text-red-500' : 'text-yellow-400'
                  }`}
                  style={{
                    textShadow: `0 0 ${Math.min(multiplier * 3, 40)}px currentColor`
                  }}
                >
                  {multiplier.toFixed(2)}x
                </div>

                {gameState === 'CRASHED' && (
                  <div className="text-3xl font-bold text-red-400 animate-pulse">
                    💥 CRASHED! 💥
                  </div>
                )}

                {/* Active Bets Display */}
                <div className="mt-8 space-y-2">
                  {activeBet1 && (
                    <div className={`px-6 py-3 rounded-lg ${
                      activeBet1.cashedOut ? 'bg-green-500/20 border border-green-500' : 'bg-blue-500/20 border border-blue-500'
                    }`}>
                      {activeBet1.cashedOut ? (
                        <p className="text-green-400 font-bold">
                          Slot 1: Cashed out {activeBet1.winAmount} tokens at {activeBet1.cashoutMultiplier.toFixed(2)}x! 🎉
                        </p>
                      ) : (
                        <p className="text-white font-bold">
                          Slot 1: {activeBet1.amount} tokens → {Math.floor(activeBet1.amount * multiplier)} tokens
                        </p>
                      )}
                    </div>
                  )}
                  
                  {activeBet2 && (
                    <div className={`px-6 py-3 rounded-lg ${
                      activeBet2.cashedOut ? 'bg-green-500/20 border border-green-500' : 'bg-blue-500/20 border border-blue-500'
                    }`}>
                      {activeBet2.cashedOut ? (
                        <p className="text-green-400 font-bold">
                          Slot 2: Cashed out {activeBet2.winAmount} tokens at {activeBet2.cashoutMultiplier.toFixed(2)}x! 🎉
                        </p>
                      ) : (
                        <p className="text-white font-bold">
                          Slot 2: {activeBet2.amount} tokens → {Math.floor(activeBet2.amount * multiplier)} tokens
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Crash point indicator (only visible after crash) */}
            {(gameState === 'CRASHED' || gameState === 'RESULTS') && (
              <div className="absolute top-4 right-4 bg-red-500/20 border border-red-500 rounded-lg px-4 py-2">
                <p className="text-red-400 font-bold">Crashed at {crashPoint?.toFixed(2)}x</p>
              </div>
            )}
          </div>

          {/* Betting Controls */}
          <div className="grid grid-cols-2 gap-4">
            {/* Slot 1 */}
            <div className="bg-slate-800/50 backdrop-blur-xl border border-blue-500/30 rounded-xl p-4">
              <h3 className="text-cyan-400 font-bold mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Bet Slot 1
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Bet Amount</label>
                  <input
                    type="number"
                    value={betAmount1}
                    onChange={(e) => setBetAmount1(Math.max(40, Math.min(2000, parseInt(e.target.value) || 40)))}
                    disabled={gameState !== 'BETTING' || activeBet1}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-white disabled:opacity-50"
                    min="40"
                    max="2000"
                  />
                  <div className="flex gap-1 mt-2">
                    {[100, 200, 500, 1000].map(amount => (
                      <button
                        key={amount}
                        onClick={() => setBetAmount1(amount)}
                        disabled={gameState !== 'BETTING' || activeBet1}
                        className="flex-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs disabled:opacity-50"
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Auto Cashout (Optional)</label>
                  <input
                    type="number"
                    value={autoCashout1 || ''}
                    onChange={(e) => setAutoCashout1(e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="e.g., 2.50"
                    disabled={gameState !== 'BETTING' || activeBet1}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-white placeholder-slate-600 disabled:opacity-50"
                    min="1.05"
                    max="300"
                    step="0.01"
                  />
                </div>
                
                {!activeBet1 ? (
                  <button
                    onClick={() => placeBet(1)}
                    disabled={gameState !== 'BETTING'}
                    className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:from-slate-700 disabled:to-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                  >
                    {gameState === 'BETTING' ? 'PLACE BET' : 'WAIT...'}
                  </button>
                ) : !activeBet1.cashedOut && gameState === 'PLAYING' ? (
                  <button
                    onClick={() => cashOut(1)}
                    className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 animate-pulse"
                  >
                    CASH OUT {Math.floor(activeBet1.amount * multiplier)} 🪙
                  </button>
                ) : (
                  <div className="w-full bg-slate-700 text-slate-400 font-bold py-3 px-4 rounded-lg text-center">
                    {activeBet1.cashedOut ? '✅ Cashed Out' : '⏳ Waiting...'}
                  </div>
                )}
              </div>
            </div>

            {/* Slot 2 */}
            <div className="bg-slate-800/50 backdrop-blur-xl border border-blue-500/30 rounded-xl p-4">
              <h3 className="text-cyan-400 font-bold mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Bet Slot 2
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Bet Amount</label>
                  <input
                    type="number"
                    value={betAmount2}
                    onChange={(e) => setBetAmount2(Math.max(40, Math.min(2000, parseInt(e.target.value) || 40)))}
                    disabled={gameState !== 'BETTING' || activeBet2}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-white disabled:opacity-50"
                    min="40"
                    max="2000"
                  />
                  <div className="flex gap-1 mt-2">
                    {[100, 200, 500, 1000].map(amount => (
                      <button
                        key={amount}
                        onClick={() => setBetAmount2(amount)}
                        disabled={gameState !== 'BETTING' || activeBet2}
                        className="flex-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs disabled:opacity-50"
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Auto Cashout (Optional)</label>
                  <input
                    type="number"
                    value={autoCashout2 || ''}
                    onChange={(e) => setAutoCashout2(e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="e.g., 2.50"
                    disabled={gameState !== 'BETTING' || activeBet2}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-white placeholder-slate-600 disabled:opacity-50"
                    min="1.05"
                    max="300"
                    step="0.01"
                  />
                </div>
                
                {!activeBet2 ? (
                  <button
                    onClick={() => placeBet(2)}
                    disabled={gameState !== 'BETTING'}
                    className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:from-slate-700 disabled:to-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                  >
                    {gameState === 'BETTING' ? 'PLACE BET' : 'WAIT...'}
                  </button>
                ) : !activeBet2.cashedOut && gameState === 'PLAYING' ? (
                  <button
                    onClick={() => cashOut(2)}
                    className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 animate-pulse"
                  >
                    CASH OUT {Math.floor(activeBet2.amount * multiplier)} 🪙
                  </button>
                ) : (
                  <div className="w-full bg-slate-700 text-slate-400 font-bold py-3 px-4 rounded-lg text-center">
                    {activeBet2.cashedOut ? '✅ Cashed Out' : '⏳ Waiting...'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Sidebar */}
        <div className="space-y-4">
          {/* User Stats */}
          <div className="bg-slate-800/50 backdrop-blur-xl border border-blue-500/30 rounded-xl p-4">
            <h3 className="text-cyan-400 font-bold mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Your Stats
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Username:</span>
                <span className="font-bold">{username}</span>
              </div>
              <div className="flex justify-between
