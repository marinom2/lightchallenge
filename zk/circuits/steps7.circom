pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/**
 * Public signals:
 *   0: binding_out    (must equal keccak(challengeId, subject) on-chain)
 *   1: commitment_e   (Poseidon(days[0..6]))
 * Private inputs:
 *   days[7] (uint)
 * Rule: each day >= 10,000
 */
template Steps7() {
    signal input binding;      // public input value
    signal output binding_out; // re-exposed for publicSignals[0]

    signal output commitment_e;

    signal input days[7];
    var THRESHOLD = 10000;

    component cmp[7];
    for (var i = 0; i < 7; i++) {
        cmp[i] = LessThan(32);          // checks a < b
        cmp[i].in[0] <== THRESHOLD;
        cmp[i].in[1] <== days[i] + 1;   // enforce days[i] >= THRESHOLD
        cmp[i].out === 1;
    }

    component pose = Poseidon(7);
    for (var j = 0; j < 7; j++) {
        pose.inputs[j] <== days[j];
    }
    commitment_e <== pose.out;

    binding_out <== binding;
}

component main = Steps7();
