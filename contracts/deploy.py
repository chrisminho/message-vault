"""
Deploy the MessageVault Key Registry contract to Algorand TestNet or MainNet.

Usage:
  python contracts/deploy.py --network testnet
  python contracts/deploy.py --network mainnet

Requires:
  - DEPLOYER_MNEMONIC environment variable (25-word Algorand mnemonic)
  - pip install py-algorand-sdk pyteal
"""

import argparse
import os
import sys

from algosdk import account, mnemonic
from algosdk.transaction import (
    ApplicationCreateTxn,
    OnComplete,
    StateSchema,
)
from algosdk.v2client import algod


NETWORKS = {
    "testnet": {
        "algod_url": "https://testnet-api.algonode.cloud",
        "algod_token": "",
    },
    "mainnet": {
        "algod_url": "https://mainnet-api.algonode.cloud",
        "algod_token": "",
    },
}


def compile_teal(client: algod.AlgodClient, teal_source: str) -> bytes:
    """Compile TEAL source to bytecode."""
    import base64
    result = client.compile(teal_source)
    return base64.b64decode(result["result"])


def main():
    parser = argparse.ArgumentParser(description="Deploy MessageVault Registry")
    parser.add_argument(
        "--network",
        choices=["testnet", "mainnet"],
        default="testnet",
        help="Network to deploy to",
    )
    args = parser.parse_args()

    mnemonic_str = os.environ.get("DEPLOYER_MNEMONIC")
    if not mnemonic_str:
        print("Error: DEPLOYER_MNEMONIC environment variable not set")
        sys.exit(1)

    private_key = mnemonic.to_private_key(mnemonic_str)
    sender = account.address_from_private_key(private_key)

    network = NETWORKS[args.network]
    client = algod.AlgodClient(network["algod_token"], network["algod_url"])

    # Read compiled TEAL
    contracts_dir = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(contracts_dir, "approval.teal")) as f:
        approval_teal = f.read()
    with open(os.path.join(contracts_dir, "clear.teal")) as f:
        clear_teal = f.read()

    # Compile
    approval_program = compile_teal(client, approval_teal)
    clear_program = compile_teal(client, clear_teal)

    # No global/local state needed — we use boxes only
    global_schema = StateSchema(0, 0)
    local_schema = StateSchema(0, 0)

    params = client.suggested_params()

    txn = ApplicationCreateTxn(
        sender=sender,
        sp=params,
        on_complete=OnComplete.NoOpOC,
        approval_program=approval_program,
        clear_program=clear_program,
        global_schema=global_schema,
        local_schema=local_schema,
    )

    signed_txn = txn.sign(private_key)
    tx_id = client.send_transaction(signed_txn)
    print(f"Deploying to {args.network}...")
    print(f"Transaction ID: {tx_id}")

    # Wait for confirmation
    from algosdk.transaction import wait_for_confirmation

    result = wait_for_confirmation(client, tx_id, 10)
    app_id = result["application-index"]
    print(f"App ID: {app_id}")
    print(f"\nSet this in your .env.local:")
    print(f"  NEXT_PUBLIC_REGISTRY_APP_ID={app_id}")


if __name__ == "__main__":
    main()
