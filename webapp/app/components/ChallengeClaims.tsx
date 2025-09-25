"use client"

export default function ChallengeClaims() {
  function claimWinner() {
    alert("Claiming Winner reward")
    // TODO: wire to claimWinner.ts
  }
  function claimLoser() {
    alert("Claiming Loser cashback")
    // TODO: wire to claimLoserCashback.ts
  }
  function claimValidator() {
    alert("Claiming Validator reward")
    // TODO: wire to claimValidator.ts
  }

  return (
    <div className="bg-[#1C1D36] p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold text-primary mb-4">Claim Rewards</h2>
      <div className="flex gap-4 flex-wrap">
        <button onClick={claimWinner} className="bg-gradient px-4 py-2 rounded text-white font-semibold">
          Claim Winner
        </button>
        <button onClick={claimLoser} className="bg-gradient px-4 py-2 rounded text-white font-semibold">
          Claim Loser
        </button>
        <button onClick={claimValidator} className="bg-gradient px-4 py-2 rounded text-white font-semibold">
          Claim Validator
        </button>
      </div>
    </div>
  )
}
