import "antd/dist/antd.css";
import { useState, useEffect } from "react";
import { Row, Col, Button, Descriptions, Table, Alert } from "antd";
import {
  useAccount,
  useBalance,
  useContract,
  useMultiTask,
  useSendTransaction,
  useLinks
} from "@vechain.energy/use-vechain";
import { ethers } from "@vechain/ethers";
const abi = require("./abi.json");
const abiErc20 = require("./erc20.json");

const CONTRACT_ADDRESS = "0x867b9b2a6b3d05902a0bc6eb4bc8570e3694b99b";
const ERC20_CONTRACT_ADDRESS = "0x0000000000000000000000000000456E65726779";

export default function App() {
  const { account, connect, disconnect } = useAccount();
  const { vet } = useBalance(account);
  const nft = useContract(CONTRACT_ADDRESS, abi);
  const token = useContract(ERC20_CONTRACT_ADDRESS, abiErc20);
  const [totalSupply, setTotalSupply] = useState(0);
  const [owners, setOwners] = useState(new Set());
  const [ownerShares, setOwnerShares] = useState(new Map());
  const { multiTask } = useMultiTask();
  const { sendTransaction } = useSendTransaction();
  const { getTransactionLink } = useLinks();
  const [tx, setTx] = useState();
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenBalance, setTokenBalance] = useState(0);
  const [error, setError] = useState();
  const [loading, setLoading] = useState(false);

  async function updateContractDetails() {
    if (!nft) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const totalSupply = await nft.totalSupply();
      setTotalSupply(totalSupply);

      const owners = new Set();
      const ownerShares = new Map();
      for (let index = 0; index < totalSupply; index += 1) {
        const tokenId = await nft.tokenByIndex(index);
        const owner = await nft.ownerOf(tokenId);
        const ownerTokenCount = ownerShares.get(owner) || 0;
        ownerShares.set(owner, ownerTokenCount + 1);
      }
      setOwners(owners);
      setOwnerShares(ownerShares);

      const tokenSymbol = await token.symbol();
      setTokenSymbol(tokenSymbol);

      if (!account) {
        return setTokenBalance(0);
      }

      const { balance } = await token.balanceOf(account);
      setTokenBalance(ethers.utils.formatEther(balance));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function shareToValue({ shares, balance, totalSupply }) {
    return (balance / totalSupply) * shares;
  }

  async function handleDistribution() {
    setLoading(true);
    setError("");
    try {
      const tx = await multiTask((transaction) => {
        for (const [to, shares] of ownerShares) {
          const value = ethers.utils
            .parseEther(
              String(shareToValue({ balance: vet, shares, totalSupply }))
            )
            .toHexString();

          sendTransaction(
            {
              to,
              value
            },
            { comment: `${shares} shares for ${to}`, transaction }
          );
        }
      });
      setTx(tx);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTokenDistribution() {
    setLoading(true);
    setError("");
    try {
      const tx = await multiTask((transaction) => {
        for (const [to, shares] of ownerShares) {
          const value = ethers.utils
            .parseEther(
              String(
                shareToValue({ balance: tokenBalance, shares, totalSupply })
              )
            )
            .toHexString();

          token.transfer(to, value, {
            comment: `${shares} shares for ${to}`,
            transaction
          });
        }
      });
      setTx(tx);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    updateContractDetails();
  }, [nft]);

  return (
    <Row gutter={[32, 32]}>
      <Col span={12} align="center">
        <Descriptions bordered column={1} title="Balance">
          <Descriptions.Item label="Address">
            {account || <Button onClick={() => connect()}>sign in</Button>}
            {!!account && (
              <Button onClick={() => disconnect()}>sign out</Button>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="VET">{vet}</Descriptions.Item>
          <Descriptions.Item label={tokenSymbol}>
            {tokenBalance}
          </Descriptions.Item>
        </Descriptions>
      </Col>
      <Col span={12} align="center">
        <Descriptions bordered column={1} title="NFT Contract">
          <Descriptions.Item label="Address">
            {CONTRACT_ADDRESS}
          </Descriptions.Item>
          <Descriptions.Item label="totalSupply()">
            {totalSupply}
          </Descriptions.Item>
          <Descriptions.Item label="Unique Owners">
            {owners.size}
          </Descriptions.Item>
        </Descriptions>
      </Col>

      <Col span={12}>
        <Button loading={loading} block onClick={handleDistribution}>
          start VET distribution
        </Button>
      </Col>
      <Col span={12}>
        <Button loading={loading} block onClick={handleTokenDistribution}>
          start Token distribution
        </Button>
      </Col>
      <Col span={24}>
        {error && <Alert message={error} closable type="error" />}
        {tx && (
          <Alert
            message="Transaction sent"
            description={
              <a
                href={getTransactionLink(tx.id)}
                target="_blank"
                rel="noreferrer"
              >
                {tx.id}
              </a>
            }
            type="success"
            closable
          />
        )}
      </Col>
      <Col span={24}>
        <Table
          itemLayout="horizontal"
          dataSource={[...ownerShares].map(([address, shares]) => ({
            address,
            shares
          }))}
          rowKey="address"
        >
          <Table.Column title="Address" dataIndex="address" />
          <Table.Column title="# of Shares" dataIndex="shares" align="right" />
          <Table.Column
            title="VET share"
            dataIndex="shares"
            align="right"
            render={(shares) =>
              Number(
                Math.floor(shareToValue({ balance: vet, totalSupply, shares }))
              ).toLocaleString()
            }
          />
          <Table.Column
            title={<>{tokenSymbol} share</>}
            dataIndex="shares"
            align="right"
            render={(shares) =>
              Number(
                Math.floor(
                  shareToValue({ balance: tokenBalance, totalSupply, shares })
                )
              ).toLocaleString()
            }
          />
        </Table>
      </Col>
    </Row>
  );
}
